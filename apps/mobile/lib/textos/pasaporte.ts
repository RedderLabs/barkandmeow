/* Pasaporte de viaje en el móvil. El título de la pantalla es
   comun.pantalla.pasaporte; las duraciones y «Enviar el enlace» vienen de
   compartir.

   Los «pasaporte.req.*» son los requisitos que escribe evaluarViaje() en
   @barkandmeow/schema. Su español tiene que ser idéntico al del paquete:
   traducirRequisito() lo usa de plantilla para reconocer cada texto y sacar
   sus huecos (lo comprueba test/pasaporte.test.ts). */

import { seccion } from "./seccion";

export default seccion(
  {
    "pasaporte.intro":
      "La copia digital de su pasaporte europeo: lo que firma tu clínica, lo que apuntas tú y lo que falta para cada viaje.",
    "pasaporte.abriendo": "Abriendo el pasaporte…",
    "pasaporte.errorAbrir": "No se ha podido abrir el pasaporte.",
    "pasaporte.errorAbrirTexto": "Revisa la conexión y tira hacia abajo para reintentar.",
    "pasaporte.sinClaveTexto":
      "El pasaporte se guarda cerrado con tu clave. Escribe el código de recuperación que apuntaste en papel: la clave se rehace aquí y no sale del móvil.",
    "pasaporte.consta": "Lo que consta",
    "pasaporte.vacio":
      "Todavía no hay nada. Lo que envíe tu clínica aparece aquí solo; lo que quieras apuntar tú se añade en barkandmeow.app/mi-mascota.",
    "pasaporte.firmadoPor": "Firmado por {clinica}",
    "pasaporte.firmadoClinica": "Firmado por la clínica",
    "pasaporte.declaradoTi": "Declarado por ti",
    "pasaporte.datos": "Datos del pasaporte",
    "pasaporte.numero": "Nº {numero}",
    "pasaporte.sinNumero": "Sin número de pasaporte",
    "pasaporte.chip": "chip {chip}",
    "pasaporte.sinChip": "sin chip completo",

    "pasaporte.viaje": "Preparar un viaje",
    "pasaporte.destino": "Destino",
    "pasaporte.destino.ue": "Otro país de la UE",
    "pasaporte.destino.ue.detalle": "Francia, Portugal, Italia, Alemania…",
    "pasaporte.destino.ueEquinococo": "Irlanda, Finlandia, Malta o Noruega",
    "pasaporte.destino.ueEquinococo.detalle":
      "También Irlanda del Norte. Piden además tratamiento contra la tenia a los perros",
    "pasaporte.destino.gb": "Gran Bretaña",
    "pasaporte.destino.gb.detalle": "Inglaterra, Escocia y Gales",
    "pasaporte.destino.fueraUe": "Fuera de la UE, con vuelta",
    "pasaporte.destino.fueraUe.detalle": "Para volver sin cuarentena desde un país que no está en la lista de la UE",
    "pasaporte.llegada": "Día de llegada",
    "pasaporte.fechaMal": "La fecha, así: 14/03/2027.",
    "pasaporte.nadaFalta": "Con lo que consta, no falta nada obligatorio.",
    "pasaporte.faltaUno": "Falta 1 requisito.",
    "pasaporte.faltanVarios": "Faltan {n} requisitos.",
    "pasaporte.requisitoDeclarado": "{titulo} (declarado por ti)",
    "pasaporte.papelVale":
      "En la frontera vale el pasaporte de papel. Esto te ayuda a llegar con todo en regla; compruébalo con tu veterinario antes de viajar.",

    "pasaporte.ensenar": "Enseñarlo en el viaje",
    "pasaporte.qrEtiqueta": "Código QR del pasaporte de viaje",
    "pasaporte.qrTexto":
      "Abre este pasaporte en el móvil del veterinario de frontera o de la compañía, en su idioma. Vale hasta el {fecha}.",
    "pasaporte.qrIntro":
      "Un QR que abre el pasaporte allí donde te lo pidan. Comprueban en el momento qué firmó cada clínica. Caduca solo, y los enlaces abiertos se retiran desde «Compartir».",
    "pasaporte.validoDurante": "Válido durante",
    "pasaporte.crearQr": "Crear el QR",

    "pasaporte.req.especie.titulo": "Requisitos según el destino",
    "pasaporte.req.especie":
      "Las reglas armonizadas de la UE son para perros, gatos y hurones. Para esta especie, consulta los servicios veterinarios del país de destino.",
    "pasaporte.req.chip.titulo": "Microchip",
    "pasaporte.req.chip.ok": "Tiene que estar puesto antes o el mismo día que la vacuna de la rabia.",
    "pasaporte.req.chip.falta": "Apunta el número de chip en el pasaporte.",
    "pasaporte.req.pasaporte.titulo": "Pasaporte europeo en papel",
    "pasaporte.req.pasaporte.ok": "Número {numero}. Llévalo contigo: es el documento que vale en la frontera.",
    "pasaporte.req.pasaporte.aviso":
      "Para volver a la UE hace falta el pasaporte europeo o un certificado sanitario. Apunta su número aquí.",
    "pasaporte.req.pasaporte.falta": "Lo expide un veterinario autorizado. Cuando lo tengas, apunta su número aquí.",
    "pasaporte.req.rabia.titulo": "Vacuna de la rabia vigente",
    "pasaporte.req.rabia.caducada":
      "La última consta válida hasta el {fecha}, antes del viaje. Hace falta revacunar, y si ya había caducado, esperar 21 días.",
    "pasaporte.req.rabia.ninguna":
      "No consta ninguna. Se pone a partir de las 12 semanas de edad, y tras la primera hay que esperar 21 días para viajar.",
    "pasaporte.req.rabia.espera":
      "Puesta el {fecha}. Si es la primera, o la anterior ya había caducado, no puede viajar hasta el {desde}. Si es un refuerzo a tiempo, no hay espera.",
    "pasaporte.req.rabia.ok": "Válida hasta el {fecha}.",
    "pasaporte.req.equinococo.titulo": "Tratamiento contra la tenia",
    "pasaporte.req.equinococo.ok": "Dado el {fecha} a las {hora}, dentro del plazo.",
    "pasaporte.req.equinococo.falta":
      "Un veterinario tiene que darle praziquantel entre el {desde} y el {hasta}, y anotarlo en el pasaporte. No hace falta si llega directamente desde otro de estos países.",
    "pasaporte.req.equinococo.faltaGb":
      "Un veterinario tiene que darle praziquantel entre el {desde} y el {hasta}, y anotarlo en el pasaporte. No hace falta si llega directamente desde otro de estos países o desde Irlanda del Norte.",
    "pasaporte.req.ruta.titulo": "Ruta y compañía aprobadas",
    "pasaporte.req.ruta":
      "Gran Bretaña acepta el pasaporte europeo, pero hay que entrar por una ruta y con una compañía aprobadas, salvo desde Irlanda.",
    "pasaporte.req.titulacion.titulo": "Análisis de anticuerpos de la rabia",
    "pasaporte.req.titulacion.ok":
      "{resultado} UI/ml, muestra del {fecha}. Hecho antes de salir y anotado en el pasaporte, a la vuelta no hay que esperar 3 meses, siempre que la vacuna no caduque.",
    "pasaporte.req.titulacion.aviso":
      "Para volver desde un país que no está en la lista de la UE: al menos 0,5 UI/ml, con la muestra tomada 30 días o más después de la vacuna. Hazlo antes de salir y que conste en el pasaporte; si no, a la vuelta hay que esperar 3 meses desde la muestra.",
    "pasaporte.req.destino.titulo": "Requisitos del país de destino",
    "pasaporte.req.destino":
      "Cada país pone los suyos para entrar (certificado sanitario, permisos, cuarentena). Consulta su embajada o sus servicios veterinarios.",
  },
  {
    pt: {
      "pasaporte.intro":
        "A cópia digital do passaporte europeu: o que a tua clínica assina, o que anotas tu e o que falta para cada viagem.",
      "pasaporte.abriendo": "A abrir o passaporte…",
      "pasaporte.errorAbrir": "Não foi possível abrir o passaporte.",
      "pasaporte.errorAbrirTexto": "Verifica a ligação à internet e puxa para baixo para tentar de novo.",
      "pasaporte.sinClaveTexto":
        "O passaporte guarda-se fechado com a tua chave. Escreve o código de recuperação que anotaste em papel: a chave refaz-se aqui e não sai do telemóvel.",
      "pasaporte.consta": "O que consta",
      "pasaporte.vacio":
        "Ainda não há nada. O que a tua clínica enviar aparece aqui sozinho; o que quiseres anotar tu acrescenta-se em barkandmeow.app/mi-mascota.",
      "pasaporte.firmadoPor": "Assinado por {clinica}",
      "pasaporte.firmadoClinica": "Assinado pela clínica",
      "pasaporte.declaradoTi": "Declarado por ti",
      "pasaporte.datos": "Dados do passaporte",
      "pasaporte.numero": "N.º {numero}",
      "pasaporte.sinNumero": "Sem número de passaporte",
      "pasaporte.chip": "chip {chip}",
      "pasaporte.sinChip": "sem o chip completo",

      "pasaporte.viaje": "Preparar uma viagem",
      "pasaporte.destino": "Destino",
      "pasaporte.destino.ue": "Outro país da UE",
      "pasaporte.destino.ue.detalle": "França, Portugal, Itália, Alemanha…",
      "pasaporte.destino.ueEquinococo": "Irlanda, Finlândia, Malta ou Noruega",
      "pasaporte.destino.ueEquinococo.detalle":
        "Também a Irlanda do Norte. Pedem ainda tratamento contra a ténia para os cães",
      "pasaporte.destino.gb": "Grã-Bretanha",
      "pasaporte.destino.gb.detalle": "Inglaterra, Escócia e País de Gales",
      "pasaporte.destino.fueraUe": "Fora da UE, com regresso",
      "pasaporte.destino.fueraUe.detalle": "Para voltar sem quarentena de um país que não está na lista da UE",
      "pasaporte.llegada": "Dia de chegada",
      "pasaporte.fechaMal": "A data, assim: 14/03/2027.",
      "pasaporte.nadaFalta": "Com o que consta, não falta nada obrigatório.",
      "pasaporte.faltaUno": "Falta 1 requisito.",
      "pasaporte.faltanVarios": "Faltam {n} requisitos.",
      "pasaporte.requisitoDeclarado": "{titulo} (declarado por ti)",
      "pasaporte.papelVale":
        "Na fronteira vale o passaporte em papel. Isto ajuda-te a chegar com tudo em ordem; confirma com o teu veterinário antes de viajar.",

      "pasaporte.ensenar": "Mostrar na viagem",
      "pasaporte.qrEtiqueta": "Código QR do passaporte de viagem",
      "pasaporte.qrTexto":
        "Abre este passaporte no telemóvel do veterinário da fronteira ou da companhia, no idioma dele. É válido até {fecha}.",
      "pasaporte.qrIntro":
        "Um QR que abre o passaporte onde to pedirem. Verificam no momento o que cada clínica assinou. Expira sozinho, e as ligações abertas retiram-se em «Partilhar».",
      "pasaporte.validoDurante": "Válido durante",
      "pasaporte.crearQr": "Criar o QR",

      "pasaporte.req.especie.titulo": "Requisitos conforme o destino",
      "pasaporte.req.especie":
        "As regras harmonizadas da UE são para cães, gatos e furões. Para esta espécie, consulta os serviços veterinários do país de destino.",
      "pasaporte.req.chip.titulo": "Microchip",
      "pasaporte.req.chip.ok": "Tem de estar colocado antes ou no mesmo dia da vacina antirrábica.",
      "pasaporte.req.chip.falta": "Anota o número do chip no passaporte.",
      "pasaporte.req.pasaporte.titulo": "Passaporte europeu em papel",
      "pasaporte.req.pasaporte.ok": "Número {numero}. Leva-o contigo: é o documento que vale na fronteira.",
      "pasaporte.req.pasaporte.aviso":
        "Para voltar à UE é preciso o passaporte europeu ou um certificado sanitário. Anota aqui o número.",
      "pasaporte.req.pasaporte.falta": "É emitido por um veterinário autorizado. Quando o tiveres, anota aqui o número.",
      "pasaporte.req.rabia.titulo": "Vacina antirrábica em dia",
      "pasaporte.req.rabia.caducada":
        "A última consta válida até {fecha}, antes da viagem. É preciso revacinar e, se já tinha caducado, esperar 21 dias.",
      "pasaporte.req.rabia.ninguna":
        "Não consta nenhuma. Dá-se a partir das 12 semanas de idade e, depois da primeira, é preciso esperar 21 dias para viajar.",
      "pasaporte.req.rabia.espera":
        "Dada a {fecha}. Se for a primeira, ou se a anterior já tinha caducado, não pode viajar até {desde}. Se for um reforço a tempo, não há espera.",
      "pasaporte.req.rabia.ok": "Válida até {fecha}.",
      "pasaporte.req.equinococo.titulo": "Tratamento contra a ténia",
      "pasaporte.req.equinococo.ok": "Dado a {fecha} às {hora}, dentro do prazo.",
      "pasaporte.req.equinococo.falta":
        "Um veterinário tem de lhe dar praziquantel entre {desde} e {hasta}, e anotá-lo no passaporte. Não é preciso se chegar diretamente de outro destes países.",
      "pasaporte.req.equinococo.faltaGb":
        "Um veterinário tem de lhe dar praziquantel entre {desde} e {hasta}, e anotá-lo no passaporte. Não é preciso se chegar diretamente de outro destes países ou da Irlanda do Norte.",
      "pasaporte.req.ruta.titulo": "Rota e companhia aprovadas",
      "pasaporte.req.ruta":
        "A Grã-Bretanha aceita o passaporte europeu, mas é preciso entrar por uma rota e com uma companhia aprovadas, exceto a partir da Irlanda.",
      "pasaporte.req.titulacion.titulo": "Titulação de anticorpos da raiva",
      "pasaporte.req.titulacion.ok":
        "{resultado} UI/ml, amostra de {fecha}. Feita antes de sair e anotada no passaporte, no regresso não é preciso esperar 3 meses, desde que a vacina não caduque.",
      "pasaporte.req.titulacion.aviso":
        "Para voltar de um país que não está na lista da UE: pelo menos 0,5 UI/ml, com a amostra colhida 30 dias ou mais depois da vacina. Faz a análise antes de sair e que conste no passaporte; se não, no regresso é preciso esperar 3 meses desde a amostra.",
      "pasaporte.req.destino.titulo": "Requisitos do país de destino",
      "pasaporte.req.destino":
        "Cada país tem os seus para entrar (certificado sanitário, autorizações, quarentena). Consulta a embaixada ou os serviços veterinários desse país.",
    },
    en: {
      "pasaporte.intro":
        "The digital copy of their EU pet passport: what your clinic signs, what you note down and what's missing for each trip.",
      "pasaporte.abriendo": "Opening the passport…",
      "pasaporte.errorAbrir": "Couldn't open the passport.",
      "pasaporte.errorAbrirTexto": "Check your connection and pull down to try again.",
      "pasaporte.sinClaveTexto":
        "The passport is stored locked with your key. Enter the recovery code you wrote down on paper: the key is rebuilt here and never leaves the phone.",
      "pasaporte.consta": "On record",
      "pasaporte.vacio":
        "Nothing here yet. Whatever your clinic sends shows up here on its own; anything you want to note down yourself is added at barkandmeow.app/mi-mascota.",
      "pasaporte.firmadoPor": "Signed by {clinica}",
      "pasaporte.firmadoClinica": "Signed by the clinic",
      "pasaporte.declaradoTi": "Declared by you",
      "pasaporte.datos": "Passport details",
      "pasaporte.numero": "No. {numero}",
      "pasaporte.sinNumero": "No passport number",
      "pasaporte.chip": "microchip {chip}",
      "pasaporte.sinChip": "no full microchip number",

      "pasaporte.viaje": "Plan a trip",
      "pasaporte.destino": "Destination",
      "pasaporte.destino.ue": "Another EU country",
      "pasaporte.destino.ue.detalle": "France, Portugal, Italy, Germany…",
      "pasaporte.destino.ueEquinococo": "Ireland, Finland, Malta or Norway",
      "pasaporte.destino.ueEquinococo.detalle":
        "Northern Ireland too. Dogs also need a tapeworm treatment",
      "pasaporte.destino.gb": "Great Britain",
      "pasaporte.destino.gb.detalle": "England, Scotland and Wales",
      "pasaporte.destino.fueraUe": "Outside the EU, and back",
      "pasaporte.destino.fueraUe.detalle": "To come back without quarantine from a country not on the EU list",
      "pasaporte.llegada": "Arrival day",
      "pasaporte.fechaMal": "Write the date like this: 14/03/2027.",
      "pasaporte.nadaFalta": "Based on what's on record, nothing required is missing.",
      "pasaporte.faltaUno": "1 requirement missing.",
      "pasaporte.faltanVarios": "{n} requirements missing.",
      "pasaporte.requisitoDeclarado": "{titulo} (declared by you)",
      "pasaporte.papelVale":
        "At the border, the paper passport is what counts. This helps you arrive with everything in order; check with your vet before you travel.",

      "pasaporte.ensenar": "Show it on the trip",
      "pasaporte.qrEtiqueta": "QR code for the travel passport",
      "pasaporte.qrTexto":
        "Opens this passport on the phone of the border vet or the carrier, in their language. Valid until {fecha}.",
      "pasaporte.qrIntro":
        "A QR code that opens the passport wherever they ask for it. They check on the spot what each clinic signed. It expires on its own, and open links can be withdrawn from «Share».",
      "pasaporte.validoDurante": "Valid for",
      "pasaporte.crearQr": "Create the QR code",

      "pasaporte.req.especie.titulo": "Requirements by destination",
      "pasaporte.req.especie":
        "The EU's harmonised rules are for dogs, cats and ferrets. For this species, check with the veterinary services of the destination country.",
      "pasaporte.req.chip.titulo": "Microchip",
      "pasaporte.req.chip.ok": "It must be implanted before or on the same day as the rabies vaccination.",
      "pasaporte.req.chip.falta": "Note the microchip number in the passport.",
      "pasaporte.req.pasaporte.titulo": "Paper EU pet passport",
      "pasaporte.req.pasaporte.ok": "Number {numero}. Take it with you: it's the document that counts at the border.",
      "pasaporte.req.pasaporte.aviso":
        "To come back into the EU you need the EU pet passport or an animal health certificate. Note its number here.",
      "pasaporte.req.pasaporte.falta": "It's issued by an authorised vet. Once you have it, note its number here.",
      "pasaporte.req.rabia.titulo": "Valid rabies vaccination",
      "pasaporte.req.rabia.caducada":
        "The last one on record is valid until {fecha}, before the trip. A new vaccination is needed, and if it had already expired, a 21-day wait.",
      "pasaporte.req.rabia.ninguna":
        "None on record. It's given from 12 weeks of age, and after the first one you have to wait 21 days to travel.",
      "pasaporte.req.rabia.espera":
        "Given on {fecha}. If it's the first one, or the previous one had already expired, they can't travel until {desde}. If it's a booster given on time, there's no wait.",
      "pasaporte.req.rabia.ok": "Valid until {fecha}.",
      "pasaporte.req.equinococo.titulo": "Tapeworm treatment",
      "pasaporte.req.equinococo.ok": "Given on {fecha} at {hora}, within the time window.",
      "pasaporte.req.equinococo.falta":
        "A vet has to give praziquantel between {desde} and {hasta}, and record it in the passport. Not needed if arriving directly from another of these countries.",
      "pasaporte.req.equinococo.faltaGb":
        "A vet has to give praziquantel between {desde} and {hasta}, and record it in the passport. Not needed if arriving directly from another of these countries or from Northern Ireland.",
      "pasaporte.req.ruta.titulo": "Approved route and carrier",
      "pasaporte.req.ruta":
        "Great Britain accepts the EU pet passport, but you must enter by an approved route and with an approved carrier, except from Ireland.",
      "pasaporte.req.titulacion.titulo": "Rabies antibody test",
      "pasaporte.req.titulacion.ok":
        "{resultado} IU/ml, sample from {fecha}. Done before leaving and recorded in the passport, there's no 3-month wait on the way back, as long as the vaccination doesn't expire.",
      "pasaporte.req.titulacion.aviso":
        "To come back from a country not on the EU list: at least 0.5 IU/ml, with the sample taken 30 days or more after the vaccination. Do it before leaving and have it recorded in the passport; otherwise there's a 3-month wait from the sample on the way back.",
      "pasaporte.req.destino.titulo": "Destination country requirements",
      "pasaporte.req.destino":
        "Each country sets its own entry rules (health certificate, permits, quarantine). Check with its embassy or its veterinary services.",
    },
    fr: {
      "pasaporte.intro":
        "La copie numérique de son passeport européen : ce que signe votre clinique, ce que vous notez et ce qui manque pour chaque voyage.",
      "pasaporte.abriendo": "Ouverture du passeport…",
      "pasaporte.errorAbrir": "Impossible d'ouvrir le passeport.",
      "pasaporte.errorAbrirTexto": "Vérifiez votre connexion et tirez vers le bas pour réessayer.",
      "pasaporte.sinClaveTexto":
        "Le passeport est enregistré verrouillé avec votre clé. Saisissez le code de récupération noté sur papier : la clé est recréée ici et ne quitte jamais le téléphone.",
      "pasaporte.consta": "Ce qui est enregistré",
      "pasaporte.vacio":
        "Rien pour l'instant. Ce que votre clinique envoie apparaît ici tout seul ; ce que vous voulez noter vous-même s'ajoute sur barkandmeow.app/mi-mascota.",
      "pasaporte.firmadoPor": "Signé par {clinica}",
      "pasaporte.firmadoClinica": "Signé par la clinique",
      "pasaporte.declaradoTi": "Déclaré par vous",
      "pasaporte.datos": "Informations du passeport",
      "pasaporte.numero": "N° {numero}",
      "pasaporte.sinNumero": "Pas de numéro de passeport",
      "pasaporte.chip": "puce {chip}",
      "pasaporte.sinChip": "puce incomplète",

      "pasaporte.viaje": "Préparer un voyage",
      "pasaporte.destino": "Destination",
      "pasaporte.destino.ue": "Un autre pays de l'UE",
      "pasaporte.destino.ue.detalle": "France, Portugal, Italie, Allemagne…",
      "pasaporte.destino.ueEquinococo": "Irlande, Finlande, Malte ou Norvège",
      "pasaporte.destino.ueEquinococo.detalle":
        "L'Irlande du Nord aussi. Ils demandent en plus un traitement contre le ténia pour les chiens",
      "pasaporte.destino.gb": "Grande-Bretagne",
      "pasaporte.destino.gb.detalle": "Angleterre, Écosse et pays de Galles",
      "pasaporte.destino.fueraUe": "Hors de l'UE, avec retour",
      "pasaporte.destino.fueraUe.detalle": "Pour revenir sans quarantaine d'un pays qui n'est pas sur la liste de l'UE",
      "pasaporte.llegada": "Jour d'arrivée",
      "pasaporte.fechaMal": "La date, comme ceci : 14/03/2027.",
      "pasaporte.nadaFalta": "D'après ce qui est enregistré, rien d'obligatoire ne manque.",
      "pasaporte.faltaUno": "Il manque 1 condition.",
      "pasaporte.faltanVarios": "Il manque {n} conditions.",
      "pasaporte.requisitoDeclarado": "{titulo} (déclaré par vous)",
      "pasaporte.papelVale":
        "À la frontière, c'est le passeport papier qui compte. Ceci vous aide à arriver en règle ; vérifiez avec votre vétérinaire avant de partir.",

      "pasaporte.ensenar": "Le montrer pendant le voyage",
      "pasaporte.qrEtiqueta": "QR code du passeport de voyage",
      "pasaporte.qrTexto":
        "Ouvre ce passeport sur le téléphone du vétérinaire de la frontière ou de la compagnie, dans sa langue. Valable jusqu'au {fecha}.",
      "pasaporte.qrIntro":
        "Un QR code qui ouvre le passeport là où on vous le demande. On y vérifie sur le moment ce que chaque clinique a signé. Il expire tout seul, et les liens ouverts se retirent depuis « Partager ».",
      "pasaporte.validoDurante": "Valable pendant",
      "pasaporte.crearQr": "Créer le QR code",

      "pasaporte.req.especie.titulo": "Conditions selon la destination",
      "pasaporte.req.especie":
        "Les règles harmonisées de l'UE concernent les chiens, les chats et les furets. Pour cette espèce, renseignez-vous auprès des services vétérinaires du pays de destination.",
      "pasaporte.req.chip.titulo": "Puce électronique",
      "pasaporte.req.chip.ok": "Elle doit être posée avant la vaccination antirabique ou le même jour.",
      "pasaporte.req.chip.falta": "Notez le numéro de puce dans le passeport.",
      "pasaporte.req.pasaporte.titulo": "Passeport européen papier",
      "pasaporte.req.pasaporte.ok": "Numéro {numero}. Emportez-le : c'est le document qui compte à la frontière.",
      "pasaporte.req.pasaporte.aviso":
        "Pour revenir dans l'UE, il faut le passeport européen ou un certificat sanitaire. Notez son numéro ici.",
      "pasaporte.req.pasaporte.falta":
        "Il est délivré par un vétérinaire habilité. Une fois que vous l'avez, notez son numéro ici.",
      "pasaporte.req.rabia.titulo": "Vaccination antirabique valide",
      "pasaporte.req.rabia.caducada":
        "La dernière enregistrée est valable jusqu'au {fecha}, avant le voyage. Il faut revacciner et, si elle avait déjà expiré, attendre 21 jours.",
      "pasaporte.req.rabia.ninguna":
        "Aucune n'est enregistrée. Elle se fait à partir de 12 semaines et, après la première, il faut attendre 21 jours pour voyager.",
      "pasaporte.req.rabia.espera":
        "Faite le {fecha}. Si c'est la première, ou si la précédente avait déjà expiré, il ne peut pas voyager avant le {desde}. Si c'est un rappel fait à temps, il n'y a pas d'attente.",
      "pasaporte.req.rabia.ok": "Valable jusqu'au {fecha}.",
      "pasaporte.req.equinococo.titulo": "Traitement contre le ténia",
      "pasaporte.req.equinococo.ok": "Donné le {fecha} à {hora}, dans le délai.",
      "pasaporte.req.equinococo.falta":
        "Un vétérinaire doit lui donner du praziquantel entre le {desde} et le {hasta}, et le noter dans le passeport. Inutile s'il arrive directement d'un autre de ces pays.",
      "pasaporte.req.equinococo.faltaGb":
        "Un vétérinaire doit lui donner du praziquantel entre le {desde} et le {hasta}, et le noter dans le passeport. Inutile s'il arrive directement d'un autre de ces pays ou d'Irlande du Nord.",
      "pasaporte.req.ruta.titulo": "Itinéraire et compagnie agréés",
      "pasaporte.req.ruta":
        "La Grande-Bretagne accepte le passeport européen, mais il faut entrer par un itinéraire et avec une compagnie agréés, sauf depuis l'Irlande.",
      "pasaporte.req.titulacion.titulo": "Titrage des anticorps antirabiques",
      "pasaporte.req.titulacion.ok":
        "{resultado} UI/ml, prélèvement du {fecha}. Fait avant le départ et noté dans le passeport : au retour, pas besoin d'attendre 3 mois, tant que la vaccination n'expire pas.",
      "pasaporte.req.titulacion.aviso":
        "Pour revenir d'un pays qui n'est pas sur la liste de l'UE : au moins 0,5 UI/ml, avec un prélèvement fait 30 jours ou plus après la vaccination. Faites-le avant de partir et faites-le noter dans le passeport ; sinon, au retour, il faut attendre 3 mois après le prélèvement.",
      "pasaporte.req.destino.titulo": "Conditions du pays de destination",
      "pasaporte.req.destino":
        "Chaque pays fixe ses propres conditions d'entrée (certificat sanitaire, permis, quarantaine). Renseignez-vous auprès de son ambassade ou de ses services vétérinaires.",
    },
  },
);
