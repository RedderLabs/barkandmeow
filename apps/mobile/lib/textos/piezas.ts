/* Las piezas que comparten las pantallas: pasos, código de activación,
   insignia de una mascota y el marco de las pantallas que abren la ficha. */

import { seccion } from "./seccion";

export default seccion(
  {
    "piezas.paso.falta": "Falta: {titulo}",
    "piezas.paso.opcional": "Opcional: {titulo}",
    "piezas.codigo.titulo": "CÓDIGO DE ACTIVACIÓN",
    "piezas.codigo.texto":
      "Llévalo a tu clínica veterinaria junto con {nombre}: leerán su chip y teclearán este código. Vale hasta el {hasta}. Apúntalo o hazle una captura: no se puede volver a mostrar, aunque sí puedes generar otro.",
    "piezas.codigo.tuMascota": "tu mascota",
    "piezas.enReclamacion": "En reclamación",
    "piezas.todoEnOrden": "Todo en orden",
    "piezas.falta.uno": "Falta 1 paso",
    "piezas.falta.varios": "Faltan {n} pasos",
    "piezas.sinNombre": "Sin nombre",
    "piezas.chip": "CHIP ···· {pista}",
    "piezas.abriendoFicha": "Abriendo la ficha…",
    "piezas.errorFicha": "No se ha podido abrir la ficha.",
    "piezas.errorFichaTexto": "Revisa la conexión y tira hacia abajo para reintentar.",
    "piezas.sinClave": "Este móvil no tiene tu clave",
    "piezas.sinClaveTexto":
      "La ficha se guarda cerrada con tu clave, y solo se abre donde está guardada. Escribe el código de recuperación que apuntaste en papel al darte de alta: la clave se rehace aquí y no sale del móvil.",
    "piezas.escribirCodigo": "Escribir el código",
  },
  {
    pt: {
      "piezas.paso.falta": "Falta: {titulo}",
      "piezas.paso.opcional": "Opcional: {titulo}",
      "piezas.codigo.titulo": "CÓDIGO DE ATIVAÇÃO",
      "piezas.codigo.texto":
        "Leva-o à tua clínica veterinária juntamente com {nombre}: vão ler o chip e escrever este código. É válido até {hasta}. Aponta-o ou tira-lhe uma captura de ecrã: não pode ser mostrado outra vez, mas podes gerar outro.",
      "piezas.codigo.tuMascota": "o teu animal",
      "piezas.enReclamacion": "Em reclamação",
      "piezas.todoEnOrden": "Tudo em ordem",
      "piezas.falta.uno": "Falta 1 passo",
      "piezas.falta.varios": "Faltam {n} passos",
      "piezas.sinNombre": "Sem nome",
      "piezas.chip": "CHIP ···· {pista}",
      "piezas.abriendoFicha": "A abrir a ficha…",
      "piezas.errorFicha": "Não foi possível abrir a ficha.",
      "piezas.errorFichaTexto": "Verifica a ligação e puxa para baixo para tentar de novo.",
      "piezas.sinClave": "Este telemóvel não tem a tua chave",
      "piezas.sinClaveTexto":
        "A ficha fica guardada fechada com a tua chave e só se abre onde ela está guardada. Escreve o código de recuperação que apontaste em papel quando te registaste: a chave é refeita aqui e não sai do telemóvel.",
      "piezas.escribirCodigo": "Escrever o código",
    },
    en: {
      "piezas.paso.falta": "To do: {titulo}",
      "piezas.paso.opcional": "Optional: {titulo}",
      "piezas.codigo.titulo": "ACTIVATION CODE",
      "piezas.codigo.texto":
        "Take it to your vet clinic along with {nombre}: they'll scan the microchip and type in this code. It's valid until {hasta}. Write it down or take a screenshot: it can't be shown again, though you can create a new one.",
      "piezas.codigo.tuMascota": "your pet",
      "piezas.enReclamacion": "Under dispute",
      "piezas.todoEnOrden": "All set",
      "piezas.falta.uno": "1 step left",
      "piezas.falta.varios": "{n} steps left",
      "piezas.sinNombre": "No name",
      "piezas.chip": "MICROCHIP ···· {pista}",
      "piezas.abriendoFicha": "Opening the record…",
      "piezas.errorFicha": "Couldn't open the record.",
      "piezas.errorFichaTexto": "Check your connection and pull down to try again.",
      "piezas.sinClave": "This phone doesn't have your key",
      "piezas.sinClaveTexto":
        "The record is locked with your key and only opens where the key is saved. Enter the recovery code you wrote down on paper when you signed up: the key is rebuilt here and never leaves the phone.",
      "piezas.escribirCodigo": "Enter the code",
    },
    fr: {
      "piezas.paso.falta": "À faire : {titulo}",
      "piezas.paso.opcional": "Facultatif : {titulo}",
      "piezas.codigo.titulo": "CODE D'ACTIVATION",
      "piezas.codigo.texto":
        "Apportez-le à votre clinique vétérinaire avec {nombre} : elle lira sa micropuce et saisira ce code. Il est valable jusqu'au {hasta}. Notez-le ou faites une capture d'écran : il ne pourra plus être affiché, mais vous pourrez en générer un autre.",
      "piezas.codigo.tuMascota": "votre animal",
      "piezas.enReclamacion": "Réclamation en cours",
      "piezas.todoEnOrden": "Tout est en ordre",
      "piezas.falta.uno": "Il reste 1 étape",
      "piezas.falta.varios": "Il reste {n} étapes",
      "piezas.sinNombre": "Sans nom",
      "piezas.chip": "MICROPUCE ···· {pista}",
      "piezas.abriendoFicha": "Ouverture de la fiche…",
      "piezas.errorFicha": "Impossible d'ouvrir la fiche.",
      "piezas.errorFichaTexto": "Vérifiez la connexion et tirez vers le bas pour réessayer.",
      "piezas.sinClave": "Ce téléphone n'a pas votre clé",
      "piezas.sinClaveTexto":
        "La fiche est verrouillée avec votre clé et ne s'ouvre que là où elle est enregistrée. Saisissez le code de récupération que vous avez noté sur papier à l'inscription : la clé est recréée ici et ne quitte pas le téléphone.",
      "piezas.escribirCodigo": "Saisir le code",
    },
  },
);
