/* La placa del collar: crearla, ver lo que enseña y retirarla. {nombre} es el
   de la mascota o, si aún no tiene, `mascota.tuMascota`; las frases están
   escritas para que encaje cualquiera de los dos. */

import { seccion } from "./seccion";

export default seccion(
  {
    "placa.intro": "Un QR que abre el resumen de urgencia en cualquier móvil, en el idioma de quien lo lee.",
    "placa.medicacion": "Medicación",
    "placa.ninguna": "Ninguna",
    "placa.ningunaRegistrada": "Ninguna registrada",
    "placa.rabia": "Rabia",
    "placa.caduco": "Caducó el {fecha}",
    "placa.validaHasta": "Válida hasta el {fecha}",
    "placa.noConsta": "No consta",
    "placa.telefono": "Teléfono",
    "placa.noSeEnsena": "No se enseña",
    "placa.ninguno": "Ninguno",
    "placa.antesFicha": "Antes, la ficha de salud",
    "placa.antesFichaTexto":
      "La placa enseña el resumen de urgencia de {nombre}: sus alergias, lo que toma y sus enfermedades. Escribe primero la ficha; después vuelve aquí y la placa se crea con un botón.",
    "placa.sustituirPregunta": "¿Sustituir la placa?",
    "placa.sustituirTexto":
      "El QR de ahora dejará de funcionar y tendrás que imprimir el nuevo. La ficha de salud no cambia.",
    "placa.sustituirSi": "Sí, crear un QR nuevo",
    "placa.retirarPregunta": "¿Retirar la placa?",
    "placa.retirarTexto":
      "El QR dejará de abrir nada y {nombre} se quedará sin placa. Puedes crear otra cuando quieras.",
    "placa.retirarSi": "Sí, retirarla",
    "placa.retirarError": "No se ha podido retirar",
    "placa.crear": "Crear la placa",
    "placa.crearTexto":
      "Quien la escanee con el móvil ve el resumen de urgencia de {nombre} en su idioma, sin instalar nada: un veterinario de guardia en otro país, o quien la encuentre.",
    "placa.telefonoQueEnsena": "Teléfono que enseña la placa",
    "placa.sinTelefonos": "No tienes teléfonos en el perfil público. Se añaden en barkandmeow.app/mi-mascota.",
    "placa.loQueEnsenara": "Esto es lo que enseñará",
    "placa.activa": "Placa activa",
    "placa.qr": "Código QR de la placa de {nombre}",
    "placa.imprimir":
      "Imprímelo o grábalo en una chapa y ponlo en su collar. También puedes escribir el enlace en una etiqueta NFC.",
    "placa.enviarEnlace": "Enviar o guardar el enlace",
    "placa.creada": "Creada el {fecha}",
    "placa.noCambiar": "No hay que cambiarla nunca: cuando actualizas la ficha, el mismo QR enseña lo nuevo.",
    "placa.loQueVe": "Lo que ve quien la escanea",
    "placa.ademas":
      "Además, el nombre, la especie, el sexo, la edad y el peso. Lo escribes tú: en la pantalla del veterinario sale como información del dueño, no como un registro oficial.",
    "placa.siPierdes": "Si pierdes la placa",
    "placa.siPierdesTexto":
      "Quien tenga el QR puede ver el resumen de urgencia. Si la placa se pierde, sustitúyela: el QR anterior deja de abrir nada al momento.",
    "placa.sustituir": "Sustituir la placa",
    "placa.retirar": "Retirar la placa",
  },
  {
    pt: {
      "placa.intro": "Um QR que abre o resumo de urgência em qualquer telemóvel, no idioma de quem o lê.",
      "placa.medicacion": "Medicação",
      "placa.ninguna": "Nenhuma",
      "placa.ningunaRegistrada": "Nenhuma registada",
      "placa.rabia": "Raiva",
      "placa.caduco": "Caducou em {fecha}",
      "placa.validaHasta": "Válida até {fecha}",
      "placa.noConsta": "Não consta",
      "placa.telefono": "Telefone",
      "placa.noSeEnsena": "Não é mostrado",
      "placa.ninguno": "Nenhum",
      "placa.antesFicha": "Primeiro, a ficha de saúde",
      "placa.antesFichaTexto":
        "A placa mostra o resumo de urgência: as alergias, o que toma e as doenças. Para {nombre}, preenche primeiro a ficha; depois volta aqui e a placa cria-se com um botão.",
      "placa.sustituirPregunta": "Substituir a placa?",
      "placa.sustituirTexto":
        "O QR atual deixará de funcionar e terás de imprimir o novo. A ficha de saúde não muda.",
      "placa.sustituirSi": "Sim, criar um QR novo",
      "placa.retirarPregunta": "Retirar a placa?",
      "placa.retirarTexto":
        "O QR deixará de abrir seja o que for e {nombre} ficará sem placa. Podes criar outra quando quiseres.",
      "placa.retirarSi": "Sim, retirar",
      "placa.retirarError": "Não foi possível retirar",
      "placa.crear": "Criar a placa",
      "placa.crearTexto":
        "Quem a ler com o telemóvel vê o resumo de urgência no seu idioma, sem instalar nada: um veterinário de serviço noutro país, ou quem encontrar {nombre}.",
      "placa.telefonoQueEnsena": "Telefone que a placa mostra",
      "placa.sinTelefonos": "Não tens telefones no perfil público. Adicionam-se em barkandmeow.app/mi-mascota.",
      "placa.loQueEnsenara": "É isto que vai mostrar",
      "placa.activa": "Placa ativa",
      "placa.qr": "Código QR da placa para {nombre}",
      "placa.imprimir":
        "Imprime-o ou grava-o numa chapa e põe-no na coleira. Também podes escrever a ligação numa etiqueta NFC.",
      "placa.enviarEnlace": "Enviar ou guardar a ligação",
      "placa.creada": "Criada em {fecha}",
      "placa.noCambiar": "Nunca é preciso mudá-la: quando atualizas a ficha, o mesmo QR mostra o que é novo.",
      "placa.loQueVe": "O que vê quem a lê",
      "placa.ademas":
        "Além disso, o nome, a espécie, o sexo, a idade e o peso. És tu que o escreves: no ecrã do veterinário aparece como informação do tutor, não como um registo oficial.",
      "placa.siPierdes": "Se perderes a placa",
      "placa.siPierdesTexto":
        "Quem tiver o QR pode ver o resumo de urgência. Se a placa se perder, substitui-a: o QR anterior deixa de abrir seja o que for no mesmo instante.",
      "placa.sustituir": "Substituir a placa",
      "placa.retirar": "Retirar a placa",
    },
    en: {
      "placa.intro": "A QR code that opens the emergency summary on any phone, in the reader's language.",
      "placa.medicacion": "Medication",
      "placa.ninguna": "None",
      "placa.ningunaRegistrada": "None recorded",
      "placa.rabia": "Rabies",
      "placa.caduco": "Expired on {fecha}",
      "placa.validaHasta": "Valid until {fecha}",
      "placa.noConsta": "Not on record",
      "placa.telefono": "Phone",
      "placa.noSeEnsena": "Not shown",
      "placa.ninguno": "None",
      "placa.antesFicha": "First, the health record",
      "placa.antesFichaTexto":
        "The tag shows {nombre}'s emergency summary: allergies, medication and conditions. Fill in the record first; then come back here and the tag is created with one tap.",
      "placa.sustituirPregunta": "Replace the tag?",
      "placa.sustituirTexto":
        "The current QR code will stop working and you'll have to print the new one. The health record doesn't change.",
      "placa.sustituirSi": "Yes, create a new QR code",
      "placa.retirarPregunta": "Remove the tag?",
      "placa.retirarTexto":
        "The QR code will stop opening anything and {nombre} will be left without a tag. You can create another one whenever you like.",
      "placa.retirarSi": "Yes, remove it",
      "placa.retirarError": "Couldn't remove the tag",
      "placa.crear": "Create the tag",
      "placa.crearTexto":
        "Whoever scans it with their phone sees {nombre}'s emergency summary in their own language, without installing anything: an on-call vet in another country, or whoever finds it.",
      "placa.telefonoQueEnsena": "Phone number shown on the tag",
      "placa.sinTelefonos": "You have no phone numbers on your public profile. Add them at barkandmeow.app/mi-mascota.",
      "placa.loQueEnsenara": "This is what it will show",
      "placa.activa": "Tag active",
      "placa.qr": "QR code for {nombre}'s tag",
      "placa.imprimir":
        "Print it or have it engraved on a tag and put it on the collar. You can also write the link to an NFC tag.",
      "placa.enviarEnlace": "Send or save the link",
      "placa.creada": "Created on {fecha}",
      "placa.noCambiar": "You never need to change it: when you update the record, the same QR code shows what's new.",
      "placa.loQueVe": "What the person scanning it sees",
      "placa.ademas":
        "Also the name, species, sex, age and weight. You write these yourself: on the vet's screen they appear as owner-provided information, not as an official record.",
      "placa.siPierdes": "If you lose the tag",
      "placa.siPierdesTexto":
        "Anyone with the QR code can see the emergency summary. If the tag gets lost, replace it: the old QR code stops opening anything straight away.",
      "placa.sustituir": "Replace the tag",
      "placa.retirar": "Remove the tag",
    },
    fr: {
      "placa.intro":
        "Un QR code qui ouvre le résumé d'urgence sur n'importe quel téléphone, dans la langue de celui qui le lit.",
      "placa.medicacion": "Traitement",
      "placa.ninguna": "Aucun",
      "placa.ningunaRegistrada": "Aucune enregistrée",
      "placa.rabia": "Rage",
      "placa.caduco": "Expiré le {fecha}",
      "placa.validaHasta": "Valable jusqu'au {fecha}",
      "placa.noConsta": "Non renseigné",
      "placa.telefono": "Téléphone",
      "placa.noSeEnsena": "Non affiché",
      "placa.ninguno": "Aucun",
      "placa.antesFicha": "D'abord, la fiche santé",
      "placa.antesFichaTexto":
        "La médaille affiche le résumé d'urgence de {nombre} : ses allergies, ses traitements et ses maladies. Remplissez d'abord la fiche ; revenez ensuite ici et la médaille se crée d'un simple bouton.",
      "placa.sustituirPregunta": "Remplacer la médaille ?",
      "placa.sustituirTexto":
        "Le QR code actuel ne fonctionnera plus et vous devrez imprimer le nouveau. La fiche santé ne change pas.",
      "placa.sustituirSi": "Oui, créer un nouveau QR code",
      "placa.retirarPregunta": "Retirer la médaille ?",
      "placa.retirarTexto":
        "Le QR code n'ouvrira plus rien et {nombre} n'aura plus de médaille. Vous pourrez en créer une autre quand vous voudrez.",
      "placa.retirarSi": "Oui, la retirer",
      "placa.retirarError": "Impossible de retirer la médaille",
      "placa.crear": "Créer la médaille",
      "placa.crearTexto":
        "Qui la scanne avec son téléphone voit le résumé d'urgence de {nombre} dans sa langue, sans rien installer : un vétérinaire de garde dans un autre pays, ou la personne qui le trouve.",
      "placa.telefonoQueEnsena": "Téléphone affiché sur la médaille",
      "placa.sinTelefonos":
        "Vous n'avez aucun téléphone dans le profil public. Ajoutez-les sur barkandmeow.app/mi-mascota.",
      "placa.loQueEnsenara": "Voici ce qu'elle affichera",
      "placa.activa": "Médaille active",
      "placa.qr": "QR code de la médaille de {nombre}",
      "placa.imprimir":
        "Imprimez-le ou faites-le graver sur une médaille et accrochez-la à son collier. Vous pouvez aussi écrire le lien sur une étiquette NFC.",
      "placa.enviarEnlace": "Envoyer ou enregistrer le lien",
      "placa.creada": "Créée le {fecha}",
      "placa.noCambiar":
        "Inutile de la changer : quand vous mettez la fiche à jour, le même QR code affiche les nouvelles informations.",
      "placa.loQueVe": "Ce que voit la personne qui la scanne",
      "placa.ademas":
        "Ainsi que le nom, l'espèce, le sexe, l'âge et le poids. C'est vous qui les saisissez : sur l'écran du vétérinaire, ils apparaissent comme des informations du propriétaire, pas comme un document officiel.",
      "placa.siPierdes": "Si vous perdez la médaille",
      "placa.siPierdesTexto":
        "Toute personne ayant le QR code peut voir le résumé d'urgence. Si la médaille est perdue, remplacez-la : l'ancien QR code n'ouvre plus rien dès cet instant.",
      "placa.sustituir": "Remplacer la médaille",
      "placa.retirar": "Retirer la médaille",
    },
  },
);
