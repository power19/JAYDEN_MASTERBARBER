/**
 * Translations for the WhatsApp booking bot.
 * Supported languages: en (English), nl (Dutch), es (Spanish), fr (French)
 *
 * Usage: t(lang, 'key') or t(lang, 'key', { placeholder: value })
 */

const TRANSLATIONS = {

  // ── English ────────────────────────────────────────────────────────────────
  en: {
    // Language selection
    lang_name: 'English',

    // Resets / shortcuts
    cancelled:         '❌ Booking cancelled. Type *menu* whenever you\'re ready! ✂️',
    invalid_menu:      'Please reply with *1 – 7*.',
    menu_language:     'Change Language',
    menu_manage:       'Manage My Appointment',

    // Main menu
    welcome:           '💈 *Welcome to {shop_name}!*\n\nHow can I help you today?',
    menu_book:         '📅 Book an Appointment',
    menu_services:     '💈 Our Services & Prices',
    menu_hours:        '⏰ Business Hours',
    menu_location:     '📍 Location',
    menu_contact:      '📞 Contact Us',
    menu_reply:        'Reply with a number to continue.',

    // Service selection
    book_header:       '📅 *Book an Appointment*\n\nSelect a service:',
    services_header:   '💈 *Services & Prices*',
    reply_number:      'Reply with a number',
    reply_or_back:     'Reply with a number, or *0* to go back',
    no_barbers_service:'😔 Sorry, no barbers are currently available for *{service}*. Please contact us directly.',
    invalid_choice:    'Please reply with *1 – {max}*.',

    // Employee selection
    choose_barber:     '💈 *Choose your barber:*',
    any_barber:        '🎲 Any Available Barber',
    service_label:     'Service',

    // Date selection
    select_date:       '📅 *Select a Date*',
    no_slots_date:     '😔 No open slots on *{date}*. Please pick another day.',

    // Time selection
    select_time:       '⏰ *Available Times*',

    // Name entry
    enter_name:        '👤 *Almost done!*\n\nPlease type your *full name* to reserve your spot:',
    name_too_short:    '✏️ Please enter your *full name* to continue.',

    // Confirmation
    confirm_header:    '✅ *Booking Summary*',
    confirm_name:      '👤 Name',
    confirm_barber:    '💈 Barber',
    confirm_service:   'Service',
    confirm_date:      '📅 Date',
    confirm_time:      '⏰ Time',
    confirm_duration:  '⏱️ Duration',
    confirm_price:     '💰 Price',
    confirm_prompt:    'Reply *YES* to confirm ✅  |  *NO* to cancel ❌',
    confirm_invalid:   'Please reply *YES* to confirm or *NO* to cancel.',
    confirm_cancel:    '❌ Booking cancelled. Type *1* to start again or *menu* for the main menu.',

    // Booking confirmed
    booked_header:     '🎉 *Appointment Confirmed!*',
    booked_code:       '🎫 *Booking Code: {code}*',
    booked_code_note:  '_Save this code — you may need it to reschedule._',
    booked_barber:     '💈 Barber: *{barber}*',
    booked_footer_default: 'We look forward to seeing you! ✂️',

    // Hours / location / contact
    hours_header:      '⏰ *Business Hours*',
    hours_back:        '🏠 Type *menu* to go back',
    hours_closed:      'Closed',
    location_header:   '📍 *Location*',
    contact_header:    '📞 *Contact Us*',
    contact_phone:     '📱 WhatsApp / Phone',
    contact_email:     '📧 Email',
    contact_instagram: '📸 Instagram',
    back_menu:         '🏠 Type *menu* to go back',
    book_prompt:       '📅 Reply *1* to book',

    // Day names
    days: ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],

    // Yes / No / Back words (lowercased)
    calendar_invite_note: '📆 A calendar invite is attached — tap it to save to Google or Apple Calendar.',

    // Appointment management (option 7)
    manage_prompt:            '📋 *Manage Appointment*\n\nEnter your *4-character booking code*:\n\n_Type *0* to go back_',
    manage_not_found:         '❌ Booking code not found. Please check and try again, or type *0* to go back.',
    manage_invalid_status:    '⚠️ This appointment is already *{status}* and cannot be modified. Type *menu* to return.',
    manage_header:            '📋 *Your Appointment*',
    manage_option_1:          '📅 Reschedule',
    manage_option_2:          '❌ Cancel Appointment',
    manage_cancel_confirm:    '⚠️ Are you sure you want to *cancel* this appointment?\n\nReply *YES* to cancel  |  *NO* to keep it',
    manage_cancelled:         '✅ Your appointment has been cancelled.\n\nWe hope to see you again soon! 💈 Type *menu* to return.',
    manage_rescheduled:       '🔄 *Appointment Rescheduled!*',
    manage_reschedule_confirm:'Confirm new date & time?',
    no_dates_available:       '😔 No available dates found. Please contact us directly.',

    back_to_main_menu:  'Booking cancelled — you\'re back at the main menu.',

    // Group / family booking
    group_size_prompt:  '👥 *For how many people is this appointment?*',
    group_just_me:      'Just me',
    group_people:       'people',
    group_people_lower: 'person(s)',
    group_overflow_note:'({first} together + {rest} right after)',
    group_slots_note:   '{count} barbers free at the same time',
    group_invalid:      'Please enter a number between *1* and *{max}*.',
    group_follow_up:    'follow-up slot',
    booked_header_group:'🎉 *Group Booking Confirmed! ({count} people)*',
    confirm_group:      '👥 Group',

    // Blocked customer
    customer_blocked: '🚫 Your access to the booking bot has been temporarily restricted. Please contact us directly at *{phone}* to resolve this.',

    // Post-appointment survey
    survey_invalid: 'Please reply with a number between *1* and *5*.',
    survey_thanks:  '🙏 *Thank you for your feedback!*\n\n{stars} ({rating}/5)\n\nWe look forward to seeing you again! 💈',

    // First-time customer welcome (shown instead of normal welcome header)
    new_customer_welcome: '🌟 *Welcome to {shop_name}!*\n\nWe\'re so glad you found us! As a first-time visitor, feel free to explore our services or jump straight into booking your first appointment. We look forward to meeting you! 💈',

    // Out-of-scope freeform message at main menu
    out_of_scope: '🤔 That\'s a bit outside what I can help with here.\n\nFor specific questions, you can reach our team directly at *{phone}*.\n\nHere\'s what I *can* do for you:',

    // Financial / discount query referral
    finance_referral: '💰 Questions about *pricing, discounts or payments* are handled by our management — not the bot.\n\nPlease reach out directly:\n📱 *{phone}*\n\nType *menu* to return to the main menu.',

    yes_words:  ['yes','y'],
    no_words:   ['no','n'],
    back_words: ['0','back','b','terug'],
  },

  // ── Dutch (Nederlands) ────────────────────────────────────────────────────
  nl: {
    lang_name: 'Nederlands',

    cancelled:         '❌ Boeking geannuleerd. Typ *menu* wanneer je klaar bent! ✂️',
    invalid_menu:      'Antwoord met *1 – 7*.',
    menu_language:     'Taal Wijzigen',
    menu_manage:       'Mijn Afspraak Beheren',

    welcome:           '💈 *Welkom bij {shop_name}!*\n\nHoe kan ik u helpen vandaag?',
    menu_book:         '📅 Afspraak Maken',
    menu_services:     '💈 Diensten & Prijzen',
    menu_hours:        '⏰ Openingstijden',
    menu_location:     '📍 Locatie',
    menu_contact:      '📞 Contact',
    menu_reply:        'Antwoord met een cijfer om door te gaan.',

    book_header:       '📅 *Afspraak Maken*\n\nKies een dienst:',
    services_header:   '💈 *Diensten & Prijzen*',
    reply_number:      'Antwoord met een cijfer',
    reply_or_back:     'Antwoord met een cijfer, of *0* om terug te gaan',
    no_barbers_service:'😔 Sorry, geen kapper beschikbaar voor *{service}*. Neem rechtstreeks contact op.',
    invalid_choice:    'Antwoord met *1 – {max}*.',

    choose_barber:     '💈 *Kies uw kapper:*',
    any_barber:        '🎲 Elke Beschikbare Kapper',
    service_label:     'Dienst',

    select_date:       '📅 *Kies een Datum*',
    no_slots_date:     '😔 Geen vrije plekken op *{date}*. Kies een andere dag.',

    select_time:       '⏰ *Beschikbare Tijden*',

    enter_name:        '👤 *Bijna klaar!*\n\nTyp uw *volledige naam* om uw plek te reserveren:',
    name_too_short:    '✏️ Voer uw *volledige naam* in om door te gaan.',

    confirm_header:    '✅ *Boekingsoverzicht*',
    confirm_name:      '👤 Naam',
    confirm_barber:    '💈 Kapper',
    confirm_service:   'Dienst',
    confirm_date:      '📅 Datum',
    confirm_time:      '⏰ Tijd',
    confirm_duration:  '⏱️ Duur',
    confirm_price:     '💰 Prijs',
    confirm_prompt:    'Antwoord *JA* om te bevestigen ✅  |  *NEE* om te annuleren ❌',
    confirm_invalid:   'Antwoord *JA* om te bevestigen of *NEE* om te annuleren.',
    confirm_cancel:    '❌ Boeking geannuleerd. Typ *1* om opnieuw te beginnen of *menu* voor het hoofdmenu.',

    booked_header:     '🎉 *Afspraak Bevestigd!*',
    booked_code:       '🎫 *Boekingscode: {code}*',
    booked_code_note:  '_Bewaar deze code — u heeft deze mogelijk nodig om te verzetten._',
    booked_barber:     '💈 Kapper: *{barber}*',
    booked_footer_default: 'We kijken uit naar uw bezoek! ✂️',

    hours_header:      '⏰ *Openingstijden*',
    hours_back:        '🏠 Typ *menu* om terug te gaan',
    hours_closed:      'Gesloten',
    location_header:   '📍 *Locatie*',
    contact_header:    '📞 *Contact*',
    contact_phone:     '📱 WhatsApp / Telefoon',
    contact_email:     '📧 E-mail',
    contact_instagram: '📸 Instagram',
    back_menu:         '🏠 Typ *menu* om terug te gaan',
    book_prompt:       '📅 Typ *1* om te boeken',

    days: ['Zondag','Maandag','Dinsdag','Woensdag','Donderdag','Vrijdag','Zaterdag'],

    calendar_invite_note: '📆 Er is een kalenderuitnodiging bijgevoegd — tik erop om op te slaan in Google of Apple Agenda.',

    // Appointment management (option 7)
    manage_prompt:            '📋 *Afspraak Beheren*\n\nVoer uw *4-tekens boekingscode* in:\n\n_Typ *0* om terug te gaan_',
    manage_not_found:         '❌ Boekingscode niet gevonden. Controleer en probeer opnieuw, of typ *0* om terug te gaan.',
    manage_invalid_status:    '⚠️ Deze afspraak is al *{status}* en kan niet worden gewijzigd. Typ *menu* om terug te keren.',
    manage_header:            '📋 *Uw Afspraak*',
    manage_option_1:          '📅 Verzetten',
    manage_option_2:          '❌ Afspraak Annuleren',
    manage_cancel_confirm:    '⚠️ Weet u zeker dat u deze afspraak wilt *annuleren*?\n\nAntwoord *JA* om te annuleren  |  *NEE* om te behouden',
    manage_cancelled:         '✅ Uw afspraak is geannuleerd.\n\nWij hopen u snel weer te zien! 💈 Typ *menu* om terug te keren.',
    manage_rescheduled:       '🔄 *Afspraak Verzet!*',
    manage_reschedule_confirm:'Nieuwe datum & tijd bevestigen?',
    no_dates_available:       '😔 Geen beschikbare datums gevonden. Neem rechtstreeks contact op.',

    back_to_main_menu:  'Boeking geannuleerd — u bent terug in het hoofdmenu.',

    // Group / family booking
    group_size_prompt:  '👥 *Voor hoeveel personen is deze afspraak?*',
    group_just_me:      'Alleen ik',
    group_people:       'personen',
    group_people_lower: 'persoon/personen',
    group_overflow_note:'({first} tegelijk + {rest} daarna)',
    group_slots_note:   '{count} kappers tegelijk beschikbaar',
    group_invalid:      'Voer een getal in tussen *1* en *{max}*.',
    group_follow_up:    'vervolg afspraak',
    booked_header_group:'🎉 *Groepsboeking Bevestigd! ({count} personen)*',
    confirm_group:      '👥 Groep',

    // Blocked customer
    customer_blocked: '🚫 Uw toegang tot de boekingsbot is tijdelijk beperkt. Neem rechtstreeks contact met ons op via *{phone}*.',

    // Post-appointment survey
    survey_invalid: 'Antwoord met een getal tussen *1* en *5*.',
    survey_thanks:  '🙏 *Bedankt voor uw feedback!*\n\n{stars} ({rating}/5)\n\nWij kijken uit naar uw volgende bezoek! 💈',

    // First-time customer welcome
    new_customer_welcome: '🌟 *Welkom bij {shop_name}!*\n\nWat fijn dat u ons gevonden heeft! Als nieuwe klant staan we klaar om u de beste ervaring te geven. Bekijk onze diensten of maak direct uw eerste afspraak! 💈',

    // Out-of-scope freeform message at main menu
    out_of_scope: '🤔 Dat valt buiten wat ik hier kan regelen.\n\nVoor specifieke vragen kunt u ons team bereiken via *{phone}*.\n\nHier is wat ik *wel* voor u kan doen:',

    // Financial / discount query referral
    finance_referral: '💰 Vragen over *prijzen, kortingen of betalingen* worden afgehandeld door onze manager — niet door de bot.\n\nNeem rechtstreeks contact op:\n📱 *{phone}*\n\nTyp *menu* om terug te gaan.',

    yes_words:  ['ja','j','yes','y'],
    no_words:   ['nee','n','no'],
    back_words: ['0','terug','back','b'],
  },

  // ── Spanish (Español) ─────────────────────────────────────────────────────
  es: {
    lang_name: 'Español',

    cancelled:         '❌ Reserva cancelada. ¡Escribe *menú* cuando estés listo! ✂️',
    invalid_menu:      'Por favor responde con *1 – 7*.',
    menu_language:     'Cambiar Idioma',
    menu_manage:       'Gestionar Mi Cita',

    welcome:           '💈 *¡Bienvenido a {shop_name}!*\n\n¿Cómo puedo ayudarte hoy?',
    menu_book:         '📅 Reservar Cita',
    menu_services:     '💈 Servicios & Precios',
    menu_hours:        '⏰ Horario de Atención',
    menu_location:     '📍 Ubicación',
    menu_contact:      '📞 Contáctenos',
    menu_reply:        'Responde con un número para continuar.',

    book_header:       '📅 *Reservar Cita*\n\nSelecciona un servicio:',
    services_header:   '💈 *Servicios & Precios*',
    reply_number:      'Responde con un número',
    reply_or_back:     'Responde con un número, o *0* para volver',
    no_barbers_service:'😔 Lo sentimos, no hay barberos disponibles para *{service}*. Contáctenos directamente.',
    invalid_choice:    'Por favor responde con *1 – {max}*.',

    choose_barber:     '💈 *Elige tu barbero:*',
    any_barber:        '🎲 Cualquier Barbero Disponible',
    service_label:     'Servicio',

    select_date:       '📅 *Selecciona una Fecha*',
    no_slots_date:     '😔 No hay horarios disponibles el *{date}*. Por favor elige otro día.',

    select_time:       '⏰ *Horarios Disponibles*',

    enter_name:        '👤 *¡Casi listo!*\n\nEscribe tu *nombre completo* para reservar tu lugar:',
    name_too_short:    '✏️ Por favor escribe tu *nombre completo* para continuar.',

    confirm_header:    '✅ *Resumen de la Reserva*',
    confirm_name:      '👤 Nombre',
    confirm_barber:    '💈 Barbero',
    confirm_service:   'Servicio',
    confirm_date:      '📅 Fecha',
    confirm_time:      '⏰ Hora',
    confirm_duration:  '⏱️ Duración',
    confirm_price:     '💰 Precio',
    confirm_prompt:    'Responde *SÍ* para confirmar ✅  |  *NO* para cancelar ❌',
    confirm_invalid:   'Por favor responde *SÍ* para confirmar o *NO* para cancelar.',
    confirm_cancel:    '❌ Reserva cancelada. Escribe *1* para empezar de nuevo o *menú* para el menú principal.',

    booked_header:     '🎉 *¡Cita Confirmada!*',
    booked_code:       '🎫 *Código de Reserva: {code}*',
    booked_code_note:  '_Guarda este código — puede que lo necesites para reprogramar._',
    booked_barber:     '💈 Barbero: *{barber}*',
    booked_footer_default: '¡Esperamos verte pronto! ✂️',

    hours_header:      '⏰ *Horario de Atención*',
    hours_back:        '🏠 Escribe *menú* para volver',
    hours_closed:      'Cerrado',
    location_header:   '📍 *Ubicación*',
    contact_header:    '📞 *Contáctenos*',
    contact_phone:     '📱 WhatsApp / Teléfono',
    contact_email:     '📧 Correo electrónico',
    contact_instagram: '📸 Instagram',
    back_menu:         '🏠 Escribe *menú* para volver',
    book_prompt:       '📅 Escribe *1* para reservar',

    days: ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'],

    calendar_invite_note: '📆 Se adjunta una invitación de calendario — tócala para guardarla en Google o Apple Calendar.',

    // Appointment management (option 7)
    manage_prompt:            '📋 *Gestionar Cita*\n\nIngresa tu *código de reserva de 4 caracteres*:\n\n_Escribe *0* para volver_',
    manage_not_found:         '❌ Código de reserva no encontrado. Verifica e inténtalo de nuevo, o escribe *0* para volver.',
    manage_invalid_status:    '⚠️ Esta cita ya está *{status}* y no puede modificarse. Escribe *menú* para volver.',
    manage_header:            '📋 *Tu Cita*',
    manage_option_1:          '📅 Reprogramar',
    manage_option_2:          '❌ Cancelar Cita',
    manage_cancel_confirm:    '⚠️ ¿Estás seguro de que quieres *cancelar* esta cita?\n\nResponde *SÍ* para cancelar  |  *NO* para conservarla',
    manage_cancelled:         '✅ Tu cita ha sido cancelada.\n\n¡Esperamos verte pronto! 💈 Escribe *menú* para volver.',
    manage_rescheduled:       '🔄 *¡Cita Reprogramada!*',
    manage_reschedule_confirm:'¿Confirmas la nueva fecha y hora?',
    no_dates_available:       '😔 No hay fechas disponibles. Contáctanos directamente.',

    back_to_main_menu:  'Reserva cancelada — está de vuelta en el menú principal.',

    // Group / family booking
    group_size_prompt:  '👥 *¿Para cuántas personas es esta cita?*',
    group_just_me:      'Solo yo',
    group_people:       'personas',
    group_people_lower: 'persona(s)',
    group_overflow_note:'({first} juntas + {rest} justo después)',
    group_slots_note:   '{count} barberos libres al mismo tiempo',
    group_invalid:      'Por favor ingresa un número entre *1* y *{max}*.',
    group_follow_up:    'turno siguiente',
    booked_header_group:'🎉 *¡Reserva Grupal Confirmada! ({count} personas)*',
    confirm_group:      '👥 Grupo',

    // Blocked customer
    customer_blocked: '🚫 Tu acceso al bot de reservas ha sido temporalmente restringido. Contáctanos directamente en *{phone}*.',

    // Post-appointment survey
    survey_invalid: 'Por favor responde con un número entre *1* y *5*.',
    survey_thanks:  '🙏 *¡Gracias por tu opinión!*\n\n{stars} ({rating}/5)\n\n¡Esperamos verte pronto! 💈',

    // First-time customer welcome
    new_customer_welcome: '🌟 *¡Bienvenido a {shop_name}!*\n\n¡Nos alegra que nos hayas encontrado! Como nuevo cliente, estamos listos para brindarte la mejor experiencia. ¡Explora nuestros servicios o reserva tu primera cita! 💈',

    // Out-of-scope freeform message at main menu
    out_of_scope: '🤔 Eso está un poco fuera de lo que puedo ayudarte aquí.\n\nPara preguntas específicas, puedes contactar a nuestro equipo en *{phone}*.\n\nAquí está lo que *sí* puedo hacer:',

    // Financial / discount query referral
    finance_referral: '💰 Las preguntas sobre *precios, descuentos o pagos* las maneja nuestra gerencia — no el bot.\n\nContáctalos directamente:\n📱 *{phone}*\n\nEscribe *menú* para volver al menú principal.',

    yes_words:  ['si','sí','s','yes','y'],
    no_words:   ['no','n'],
    back_words: ['0','volver','back','b'],
  },

  // ── French (Français) ─────────────────────────────────────────────────────
  fr: {
    lang_name: 'Français',

    cancelled:         '❌ Réservation annulée. Tapez *menu* quand vous êtes prêt ! ✂️',
    invalid_menu:      'Veuillez répondre avec *1 – 7*.',
    menu_language:     'Changer de Langue',
    menu_manage:       'Gérer Mon Rendez-vous',

    welcome:           '💈 *Bienvenue chez {shop_name} !*\n\nComment puis-je vous aider aujourd\'hui ?',
    menu_book:         '📅 Prendre Rendez-vous',
    menu_services:     '💈 Nos Services & Tarifs',
    menu_hours:        '⏰ Heures d\'Ouverture',
    menu_location:     '📍 Adresse',
    menu_contact:      '📞 Nous Contacter',
    menu_reply:        'Répondez avec un numéro pour continuer.',

    book_header:       '📅 *Prendre Rendez-vous*\n\nChoisissez un service :',
    services_header:   '💈 *Services & Tarifs*',
    reply_number:      'Répondez avec un numéro',
    reply_or_back:     'Répondez avec un numéro, ou *0* pour revenir',
    no_barbers_service:'😔 Désolé, aucun barbier n\'est disponible pour *{service}*. Veuillez nous contacter directement.',
    invalid_choice:    'Veuillez répondre avec *1 – {max}*.',

    choose_barber:     '💈 *Choisissez votre barbier :*',
    any_barber:        '🎲 N\'importe quel Barbier Disponible',
    service_label:     'Service',

    select_date:       '📅 *Choisissez une Date*',
    no_slots_date:     '😔 Aucun créneau disponible le *{date}*. Veuillez choisir un autre jour.',

    select_time:       '⏰ *Créneaux Disponibles*',

    enter_name:        '👤 *Presque terminé !*\n\nVeuillez taper votre *nom complet* pour réserver votre place :',
    name_too_short:    '✏️ Veuillez entrer votre *nom complet* pour continuer.',

    confirm_header:    '✅ *Récapitulatif de la Réservation*',
    confirm_name:      '👤 Nom',
    confirm_barber:    '💈 Barbier',
    confirm_service:   'Service',
    confirm_date:      '📅 Date',
    confirm_time:      '⏰ Heure',
    confirm_duration:  '⏱️ Durée',
    confirm_price:     '💰 Prix',
    confirm_prompt:    'Répondez *OUI* pour confirmer ✅  |  *NON* pour annuler ❌',
    confirm_invalid:   'Veuillez répondre *OUI* pour confirmer ou *NON* pour annuler.',
    confirm_cancel:    '❌ Réservation annulée. Tapez *1* pour recommencer ou *menu* pour le menu principal.',

    booked_header:     '🎉 *Rendez-vous Confirmé !*',
    booked_code:       '🎫 *Code de Réservation : {code}*',
    booked_code_note:  '_Conservez ce code — vous pourriez en avoir besoin pour reprogrammer._',
    booked_barber:     '💈 Barbier : *{barber}*',
    booked_footer_default: 'Nous avons hâte de vous voir ! ✂️',

    hours_header:      '⏰ *Heures d\'Ouverture*',
    hours_back:        '🏠 Tapez *menu* pour revenir',
    hours_closed:      'Fermé',
    location_header:   '📍 *Adresse*',
    contact_header:    '📞 *Nous Contacter*',
    contact_phone:     '📱 WhatsApp / Téléphone',
    contact_email:     '📧 E-mail',
    contact_instagram: '📸 Instagram',
    back_menu:         '🏠 Tapez *menu* pour revenir',
    book_prompt:       '📅 Tapez *1* pour réserver',

    days: ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'],

    calendar_invite_note: '📆 Une invitation de calendrier est jointe — appuyez dessus pour l\'enregistrer dans Google ou Apple Calendrier.',

    // Appointment management (option 7)
    manage_prompt:            '📋 *Gérer Rendez-vous*\n\nEntrez votre *code de réservation de 4 caractères* :\n\n_Tapez *0* pour revenir_',
    manage_not_found:         '❌ Code de réservation introuvable. Vérifiez et réessayez, ou tapez *0* pour revenir.',
    manage_invalid_status:    '⚠️ Ce rendez-vous est déjà *{status}* et ne peut pas être modifié. Tapez *menu* pour revenir.',
    manage_header:            '📋 *Votre Rendez-vous*',
    manage_option_1:          '📅 Reporter',
    manage_option_2:          '❌ Annuler le Rendez-vous',
    manage_cancel_confirm:    '⚠️ Êtes-vous sûr de vouloir *annuler* ce rendez-vous ?\n\nRépondez *OUI* pour annuler  |  *NON* pour le conserver',
    manage_cancelled:         '✅ Votre rendez-vous a été annulé.\n\nNous espérons vous revoir bientôt ! 💈 Tapez *menu* pour revenir.',
    manage_rescheduled:       '🔄 *Rendez-vous Reporté !*',
    manage_reschedule_confirm:'Confirmez la nouvelle date et heure ?',
    no_dates_available:       '😔 Aucune date disponible. Veuillez nous contacter directement.',

    back_to_main_menu:  'Réservation annulée — vous êtes de retour au menu principal.',

    // Group / family booking
    group_size_prompt:  '👥 *Pour combien de personnes est ce rendez-vous ?*',
    group_just_me:      'Juste moi',
    group_people:       'personnes',
    group_people_lower: 'personne(s)',
    group_overflow_note:'({first} ensemble + {rest} juste après)',
    group_slots_note:   '{count} barbiers disponibles simultanément',
    group_invalid:      'Veuillez entrer un nombre entre *1* et *{max}*.',
    group_follow_up:    'suite du rendez-vous',
    booked_header_group:'🎉 *Réservation Groupée Confirmée ! ({count} personnes)*',
    confirm_group:      '👥 Groupe',

    // Blocked customer
    customer_blocked: '🚫 Votre accès au bot de réservation a été temporairement restreint. Veuillez nous contacter directement au *{phone}*.',

    // Post-appointment survey
    survey_invalid: 'Veuillez répondre avec un nombre entre *1* et *5*.',
    survey_thanks:  '🙏 *Merci pour votre retour !*\n\n{stars} ({rating}/5)\n\nNous avons hâte de vous revoir ! 💈',

    // First-time customer welcome
    new_customer_welcome: '🌟 *Bienvenue chez {shop_name} !*\n\nNous sommes ravis que vous nous ayez trouvés ! En tant que nouveau client, nous sommes prêts à vous offrir la meilleure expérience. Parcourez nos services ou réservez votre premier rendez-vous ! 💈',

    // Out-of-scope freeform message at main menu
    out_of_scope: '🤔 Cela dépasse un peu ce que je peux faire ici.\n\nPour des questions spécifiques, contactez notre équipe au *{phone}*.\n\nVoici ce que je peux *faire* pour vous :',

    // Financial / discount query referral
    finance_referral: '💰 Les questions sur les *tarifs, réductions ou paiements* sont gérées par notre direction — pas par le bot.\n\nContactez-les directement :\n📱 *{phone}*\n\nTapez *menu* pour revenir au menu principal.',

    yes_words:  ['oui','o','yes','y'],
    no_words:   ['non','no','n'],
    back_words: ['0','retour','back','b'],
  },
};

/** Get a translation string, filling in {placeholders} */
function t(lang, key, vars = {}) {
  const strings = TRANSLATIONS[lang] || TRANSLATIONS.en;
  let str = strings[key] ?? TRANSLATIONS.en[key] ?? key;
  for (const [k, v] of Object.entries(vars)) {
    str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
  }
  return str;
}

/** The language-selection menu shown to every new user (all 4 languages) */
function buildLanguageMenu() {
  return [
    '🌐 *Please choose your language:*',
    '🌐 *Kies uw taal:*',
    '🌐 *Por favor elige tu idioma:*',
    '🌐 *Veuillez choisir votre langue :*',
    '',
    '1️⃣  🇬🇧 Engels / English',
    '2️⃣  🇳🇱 Nederlands / Dutch',
    '3️⃣  🇪🇸 Español / Spanish',
    '4️⃣  🇫🇷 Français / French',
  ].join('\n');
}

const LANG_MAP = { '1': 'en', '2': 'nl', '3': 'es', '4': 'fr' };
const SUPPORTED = Object.keys(TRANSLATIONS);

module.exports = { t, buildLanguageMenu, LANG_MAP, SUPPORTED, TRANSLATIONS };
