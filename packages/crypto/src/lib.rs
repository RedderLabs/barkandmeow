//! Núcleo criptográfico de Bark & Meow.
//!
//! Lo comparten la app del dueño (nativo) y la web del veterinario (WASM), así
//! que un bloque que cierra uno lo abre el otro byte a byte. Tres formatos:
//!
//! - **Sobre** (`0x01 | nonce 24 | texto cifrado`): XChaCha20-Poly1305. Resumen
//!   de emergencia (clave `E`) y copia temporal del historial (clave `T`).
//! - **Documento** (`0x02 | prefijo 19 | bloques`): XChaCha20-Poly1305 en modo
//!   STREAM (BE32) con bloques de 1 MiB, para PDFs que no caben en un sobre.
//! - **Sellado** (`clave efímera 32 | caja`): sobre sellado X25519 compatible
//!   con `crypto_box_seal` de libsodium. Notas del veterinario y avisos: quien
//!   escribe no puede volver a leerlos; solo el dueño.
//!
//! En los tres, los datos asociados atan el bloque a su identificador: el
//! servidor no puede cambiar la ficha de una placa por la de otra sin que el
//! descifrado falle.
//!
//! Nada de aleatoriedad aquí dentro: nonces, prefijos y claves efímeras los
//! pone quien llama. En el navegador salen de `crypto.getRandomValues`.

use blake2::digest::{Update, VariableOutput};
use chacha20poly1305::aead::stream::{DecryptorBE32, EncryptorBE32};
use chacha20poly1305::aead::{Aead, KeyInit, Payload};
use chacha20poly1305::{XChaCha20Poly1305, XNonce};
use crypto_box::{PublicKey, SalsaBox, SecretKey};

pub const VERSION_SOBRE: u8 = 0x01;
pub const VERSION_DOCUMENTO: u8 = 0x02;
/// Tamaño de bloque de los documentos, en claro.
pub const BLOQUE: usize = 1 << 20;
const ETIQUETA: usize = 16;
const PREFIJO: usize = 19;

#[derive(Debug, PartialEq, Eq)]
pub enum Error {
    /// El bloque no tiene la forma esperada: versión, longitud.
    Formato,
    /// La etiqueta no cuadra: clave equivocada, datos asociados distintos o
    /// bloque manipulado. No se distingue a propósito.
    Autenticacion,
}

impl Error {
    // Solo lo usa la interfaz WASM.
    #[cfg_attr(not(target_arch = "wasm32"), allow(dead_code))]
    fn codigo(&self) -> i32 {
        match self {
            Error::Formato => -1,
            Error::Autenticacion => -2,
        }
    }
}

/* ── Sobre ──────────────────────────────────────────────────── */

pub fn cerrar(clave: &[u8; 32], ad: &[u8], nonce: &[u8; 24], texto: &[u8]) -> Vec<u8> {
    let aead = XChaCha20Poly1305::new(clave.into());
    let cifrado = aead
        .encrypt(XNonce::from_slice(nonce), Payload { msg: texto, aad: ad })
        .expect("XChaCha20-Poly1305 no falla al cifrar");
    let mut sobre = Vec::with_capacity(1 + 24 + cifrado.len());
    sobre.push(VERSION_SOBRE);
    sobre.extend_from_slice(nonce);
    sobre.extend_from_slice(&cifrado);
    sobre
}

pub fn abrir(clave: &[u8; 32], ad: &[u8], sobre: &[u8]) -> Result<Vec<u8>, Error> {
    if sobre.len() < 1 + 24 + ETIQUETA || sobre[0] != VERSION_SOBRE {
        return Err(Error::Formato);
    }
    let aead = XChaCha20Poly1305::new(clave.into());
    aead.decrypt(
        XNonce::from_slice(&sobre[1..25]),
        Payload { msg: &sobre[25..], aad: ad },
    )
    .map_err(|_| Error::Autenticacion)
}

/* ── Documento ──────────────────────────────────────────────── */

pub fn cerrar_documento(clave: &[u8; 32], ad: &[u8], prefijo: &[u8; PREFIJO], texto: &[u8]) -> Vec<u8> {
    let aead = XChaCha20Poly1305::new(clave.into());
    let mut enc = EncryptorBE32::from_aead(aead, prefijo.into());
    let mut doc = Vec::with_capacity(1 + PREFIJO + texto.len() + (texto.len() / BLOQUE + 1) * ETIQUETA);
    doc.push(VERSION_DOCUMENTO);
    doc.extend_from_slice(prefijo);

    let mut resto = texto;
    while resto.len() > BLOQUE {
        let (bloque, siguiente) = resto.split_at(BLOQUE);
        let c = enc
            .encrypt_next(Payload { msg: bloque, aad: ad })
            .expect("STREAM no falla al cifrar");
        doc.extend_from_slice(&c);
        resto = siguiente;
    }
    let c = enc
        .encrypt_last(Payload { msg: resto, aad: ad })
        .expect("STREAM no falla al cifrar");
    doc.extend_from_slice(&c);
    doc
}

pub fn abrir_documento(clave: &[u8; 32], ad: &[u8], doc: &[u8]) -> Result<Vec<u8>, Error> {
    if doc.len() < 1 + PREFIJO + ETIQUETA || doc[0] != VERSION_DOCUMENTO {
        return Err(Error::Formato);
    }
    let aead = XChaCha20Poly1305::new(clave.into());
    let prefijo: &[u8; PREFIJO] = doc[1..1 + PREFIJO].try_into().map_err(|_| Error::Formato)?;
    let mut dec = DecryptorBE32::from_aead(aead, prefijo.into());
    let mut texto = Vec::with_capacity(doc.len());

    let mut resto = &doc[1 + PREFIJO..];
    // Un bloque es «el último» solo si es lo que queda; así un documento truncado
    // en una frontera de bloque falla en vez de abrirse incompleto.
    while resto.len() > BLOQUE + ETIQUETA {
        let (bloque, siguiente) = resto.split_at(BLOQUE + ETIQUETA);
        let t = dec
            .decrypt_next(Payload { msg: bloque, aad: ad })
            .map_err(|_| Error::Autenticacion)?;
        texto.extend_from_slice(&t);
        resto = siguiente;
    }
    let t = dec
        .decrypt_last(Payload { msg: resto, aad: ad })
        .map_err(|_| Error::Autenticacion)?;
    texto.extend_from_slice(&t);
    Ok(texto)
}

/* ── Sellado X25519 (crypto_box_seal) ───────────────────────── */

pub fn publica(secreta: &[u8; 32]) -> [u8; 32] {
    *SecretKey::from(*secreta).public_key().as_bytes()
}

/// nonce = BLAKE2b-192(clave efímera pública ‖ clave del destinatario), como libsodium.
fn nonce_sellado(efimera: &PublicKey, destino: &PublicKey) -> crypto_box::Nonce {
    let mut h = blake2::Blake2bVar::new(24).expect("24 es una salida válida de BLAKE2b");
    h.update(efimera.as_bytes());
    h.update(destino.as_bytes());
    let mut n = crypto_box::Nonce::default();
    h.finalize_variable(&mut n).expect("la salida mide 24");
    n
}

pub fn sellar(destino: &[u8; 32], efimera: &[u8; 32], texto: &[u8]) -> Vec<u8> {
    let destino = PublicKey::from(*destino);
    let efimera = SecretKey::from(*efimera);
    let efimera_pub = efimera.public_key();
    let nonce = nonce_sellado(&efimera_pub, &destino);
    let caja = SalsaBox::new(&destino, &efimera)
        .encrypt(&nonce, texto)
        .expect("XSalsa20-Poly1305 no falla al cifrar");
    let mut sellado = Vec::with_capacity(32 + caja.len());
    sellado.extend_from_slice(efimera_pub.as_bytes());
    sellado.extend_from_slice(&caja);
    sellado
}

pub fn abrir_sellado(secreta: &[u8; 32], sellado: &[u8]) -> Result<Vec<u8>, Error> {
    if sellado.len() < 32 + ETIQUETA {
        return Err(Error::Formato);
    }
    let secreta = SecretKey::from(*secreta);
    let efimera: [u8; 32] = sellado[..32].try_into().map_err(|_| Error::Formato)?;
    let efimera = PublicKey::from(efimera);
    let nonce = nonce_sellado(&efimera, &secreta.public_key());
    SalsaBox::new(&efimera, &secreta)
        .decrypt(&nonce, &sellado[32..])
        .map_err(|_| Error::Autenticacion)
}

/* ── Derivación ───────────────────────────────────────────────
   La clave de la clínica sale de su código de recuperación en papel: quien
   guarda el papel puede reconstruirla en otro navegador. */

/// HKDF-SHA256 sin sal: la semilla ya es aleatoria y uniforme. `info` separa
/// usos (clave de clínica, dispositivo...) para que una semilla no sirva a dos.
pub fn derivar(semilla: &[u8], info: &[u8]) -> [u8; 32] {
    let mut clave = [0u8; 32];
    hkdf::Hkdf::<sha2::Sha256>::new(None, semilla)
        .expand(info, &mut clave)
        .expect("32 bytes es una salida válida de HKDF-SHA256");
    clave
}

/* ── Interfaz WASM ───────────────────────────────────────────
   Sin wasm-bindgen: funciones C planas sobre la memoria lineal. Quien llama
   reserva, copia la entrada, llama, y lee el resultado de `bm_salida_ptr`
   con la longitud devuelta. Un número negativo es un Error. */

#[cfg(target_arch = "wasm32")]
mod wasm {
    use super::*;
    use std::cell::RefCell;

    thread_local! {
        static SALIDA: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
    }

    fn entregar(r: Result<Vec<u8>, Error>) -> i32 {
        match r {
            Ok(v) => {
                let n = v.len() as i32;
                SALIDA.with(|s| *s.borrow_mut() = v);
                n
            }
            Err(e) => e.codigo(),
        }
    }

    unsafe fn trozo<'a>(p: *const u8, n: usize) -> &'a [u8] {
        if n == 0 { &[] } else { unsafe { core::slice::from_raw_parts(p, n) } }
    }

    unsafe fn fijo<'a, const N: usize>(p: *const u8) -> &'a [u8; N] {
        unsafe { &*(p as *const [u8; N]) }
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn bm_reservar(n: usize) -> *mut u8 {
        let mut v = Vec::<u8>::with_capacity(n.max(1));
        let p = v.as_mut_ptr();
        core::mem::forget(v);
        p
    }

    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn bm_liberar(p: *mut u8, n: usize) {
        unsafe { drop(Vec::from_raw_parts(p, 0, n.max(1))) }
    }

    #[unsafe(no_mangle)]
    pub extern "C" fn bm_salida_ptr() -> *const u8 {
        SALIDA.with(|s| s.borrow().as_ptr())
    }

    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn bm_abrir(clave: *const u8, ad: *const u8, ad_n: usize, s: *const u8, s_n: usize) -> i32 {
        unsafe { entregar(abrir(fijo(clave), trozo(ad, ad_n), trozo(s, s_n))) }
    }

    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn bm_cerrar(clave: *const u8, ad: *const u8, ad_n: usize, nonce: *const u8, t: *const u8, t_n: usize) -> i32 {
        unsafe { entregar(Ok(cerrar(fijo(clave), trozo(ad, ad_n), fijo(nonce), trozo(t, t_n)))) }
    }

    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn bm_abrir_documento(clave: *const u8, ad: *const u8, ad_n: usize, d: *const u8, d_n: usize) -> i32 {
        unsafe { entregar(abrir_documento(fijo(clave), trozo(ad, ad_n), trozo(d, d_n))) }
    }

    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn bm_abrir_sellado(secreta: *const u8, s: *const u8, s_n: usize) -> i32 {
        unsafe { entregar(abrir_sellado(fijo(secreta), trozo(s, s_n))) }
    }

    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn bm_publica(secreta: *const u8) -> i32 {
        unsafe { entregar(Ok(publica(fijo(secreta)).to_vec())) }
    }

    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn bm_cerrar_documento(clave: *const u8, ad: *const u8, ad_n: usize, prefijo: *const u8, t: *const u8, t_n: usize) -> i32 {
        unsafe { entregar(Ok(cerrar_documento(fijo(clave), trozo(ad, ad_n), fijo(prefijo), trozo(t, t_n)))) }
    }

    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn bm_derivar(s: *const u8, s_n: usize, info: *const u8, info_n: usize) -> i32 {
        unsafe { entregar(Ok(derivar(trozo(s, s_n), trozo(info, info_n)).to_vec())) }
    }

    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn bm_sellar(destino: *const u8, efimera: *const u8, t: *const u8, t_n: usize) -> i32 {
        unsafe { entregar(Ok(sellar(fijo(destino), fijo(efimera), trozo(t, t_n)))) }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn azar<const N: usize>() -> [u8; N] {
        let mut b = [0u8; N];
        getrandom::getrandom(&mut b).unwrap();
        b
    }

    #[test]
    fn sobre_ida_y_vuelta() {
        let k = azar::<32>();
        let s = cerrar(&k, b"bm:e:v1:placa", &azar(), b"{\"alergias\":[]}");
        assert_eq!(abrir(&k, b"bm:e:v1:placa", &s).unwrap(), b"{\"alergias\":[]}");
    }

    #[test]
    fn sobre_rechaza_otra_clave_otro_id_o_manipulado() {
        let k = azar::<32>();
        let mut s = cerrar(&k, b"id-a", &azar(), b"ficha");
        assert_eq!(abrir(&azar(), b"id-a", &s), Err(Error::Autenticacion));
        assert_eq!(abrir(&k, b"id-b", &s), Err(Error::Autenticacion));
        let ultimo = s.len() - 1;
        s[ultimo] ^= 1;
        assert_eq!(abrir(&k, b"id-a", &s), Err(Error::Autenticacion));
        assert_eq!(abrir(&k, b"id-a", &[0x09; 60]), Err(Error::Formato));
    }

    #[test]
    fn documento_en_varios_bloques() {
        let k = azar::<32>();
        for n in [0, 10, BLOQUE, BLOQUE + 1, 2 * BLOQUE + 7] {
            let texto: Vec<u8> = (0..n).map(|i| (i % 251) as u8).collect();
            let d = cerrar_documento(&k, b"doc", &azar(), &texto);
            assert_eq!(abrir_documento(&k, b"doc", &d).unwrap(), texto, "n = {n}");
        }
    }

    #[test]
    fn documento_truncado_no_se_abre() {
        let k = azar::<32>();
        let texto = vec![7u8; 2 * BLOQUE + 5];
        let d = cerrar_documento(&k, b"doc", &azar(), &texto);
        // Cortado justo tras el primer bloque completo.
        let corte = 1 + PREFIJO + BLOQUE + ETIQUETA;
        assert_eq!(abrir_documento(&k, b"doc", &d[..corte]), Err(Error::Autenticacion));
    }

    #[test]
    fn sellado_solo_lo_abre_el_dueno() {
        let dueno = azar::<32>();
        let s = sellar(&publica(&dueno), &azar(), b"nota de la consulta");
        assert_eq!(abrir_sellado(&dueno, &s).unwrap(), b"nota de la consulta");
        assert_eq!(abrir_sellado(&azar(), &s), Err(Error::Autenticacion));
    }

    #[test]
    fn derivar_es_determinista_y_separa_usos() {
        let s = [7u8; 19];
        assert_eq!(derivar(&s, b"bm:clinica:x25519:v1"), derivar(&s, b"bm:clinica:x25519:v1"));
        assert_ne!(derivar(&s, b"bm:clinica:x25519:v1"), derivar(&s, b"otro-uso"));
        assert_ne!(derivar(&s, b"bm:clinica:x25519:v1"), derivar(&[8u8; 19], b"bm:clinica:x25519:v1"));
    }

    /// RFC 5869, caso de prueba 3 (sin sal ni info): primeros 32 bytes del OKM.
    #[test]
    fn derivar_coincide_con_rfc5869() {
        let esperado = [
            0x8d, 0xa4, 0xe7, 0x75, 0xa5, 0x63, 0xc1, 0x8f, 0x71, 0x5f, 0x80, 0x2a, 0x06, 0x3c, 0x5a, 0x31,
            0xb8, 0xa1, 0x1f, 0x5c, 0x5e, 0xe1, 0x87, 0x9e, 0xc3, 0x45, 0x4e, 0x5f, 0x3c, 0x73, 0x8d, 0x2d,
        ];
        assert_eq!(derivar(&[0x0bu8; 22], b""), esperado);
    }

    /// Interoperabilidad: lo que sella crypto_box (la implementación de
    /// referencia de libsodium en Rust) lo abre este código, y al revés.
    #[test]
    fn sellado_compatible_con_crypto_box_seal() {
        let dueno = SecretKey::from(azar::<32>());
        let de_ellos = dueno.public_key().seal(&mut crypto_box::aead::OsRng, b"de libsodium").unwrap();
        assert_eq!(abrir_sellado(&dueno.to_bytes(), &de_ellos).unwrap(), b"de libsodium");

        let nuestro = sellar(dueno.public_key().as_bytes(), &azar(), b"de bark & meow");
        assert_eq!(dueno.unseal(&nuestro).unwrap(), b"de bark & meow");
    }
}
