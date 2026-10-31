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
    invalid_menu:      'Please reply with *1 – 9*.',
    menu_language:     'Change Language',
    menu_manage:       'Manage My Appointment',

    // Main menu
    welcome:           '*Welcome to {shop_name}!*\n\nChoose a number to get started. 👇',
    menu_book:         '📅 Book an Appointment',
    menu_services:     '💈 Our Services & Prices',
    menu_hours:        '⏰ Business Hours',
    menu_location:     '📍 Location',
    menu_prices:       '💰 Service Prices',
    menu_contact:      '📞 Contact Us',
    menu_reply:        'Reply with a number to continue.',
    media_return_hint: '↩️ _Type *menu* to return to the main menu._',

    // Service selection
    book_header:       '📅 *Book an Appointment*\n\nSelect a service:',
    services_header:   '💈 *Services & Prices*',
    reply_number:      'Reply with a number',
    reply_or_back:     'Reply with a number, or *0* to go back',
    more_dates:        'Type *more* to see more dates',
    more_times:        'Type *more* to see more available times',
    more_services:     'Type *more* to see more services',
    no_barbers_service:'😔 Sorry, no barbers are currently available for *{service}*. Please contact us directly.',
    invalid_choice:    'Please reply with *1 – {max}*.',
    house_call_share_location: '🏠 *House Call*\n\nPlease share your location so we can calculate the visit fee and travel time.\n\n📎 Tap the attachment icon → Location → Send your current location.',
    house_call_unavailable:    '😔 Sorry, no barbers currently offer house calls. Please book an in-shop appointment instead.',
    house_call_out_of_range:   '😔 Sorry, that\'s outside our house-call area (max {max} km). Would you like to book an in-shop appointment instead?',
    house_call_summary:        '🏠 *House Call*\n📍 Distance: {km} km\n💰 Extra fee: {currency} {fee}\n⏱️ Extra time: {minutes} min\n\n_This is added to your service price and appointment length._',
    booked_house_call_note:    '🏠 _We\'ll come to you — see the location and fee details above._',
    house_call_service_name:   'House Call',

    // Employee selection
    choose_barber:     '💈 *Choose your barber:*',
    any_barber:        '🎲 Any Available Barber',
    service_label:     'Service',

    // Date selection
    select_date:       '📅 *Select a Date*',
    no_slots_date:     '😔 No open slots on *{date}*. Please pick another day.',

    // Time selection
    select_time:       '⏰ *Available Times*',
    slot_taken_retry:  '😔 Sorry, that time slot was just taken by another customer. Please pick a different time.',

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
    confirm_prompt:    'Reply *YES* to confirm your appointment ✅\n\n*NO* to cancel your appointment ❌',
    confirm_invalid:   'Please reply *YES* to confirm or *NO* to cancel.',
    confirm_cancel:    '❌ Booking cancelled. Type *1* to start again or *menu* for the main menu.',

    // Booking confirmed
    booked_header:     '🎉 *Appointment Confirmed!*',
    booked_code:       '🎫 *Booking Code: {code}*',
    booked_code_note:  '_Save this code — you may need it to reschedule._',
    booked_barber:     '💈 Barber: *{barber}*',
    booked_footer_default: 'We look forward to seeing you! ✂️',
    booked_cancel_note:    'To cancel or reschedule, contact us directly.',
    booked_cancel_self:    'To cancel or reschedule, choose option {option} in the menu.',
    payment_methods:       'Payment methods:\n✅ card (PIN) accepted\n✅ bank transfer accepted\n✅ cash accepted',

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
    manage_list_header:       '📋 *Your Upcoming Appointments*\n\nSelect one to reschedule or cancel:',
    cancel_all_mine:          '🗑️ Cancel ALL my appointments',
    manage_no_appts:          '📋 You have no upcoming appointments under this number.\n\nIf you booked under a different number, enter your *4-character booking code*, or type *0* to go back.',
    manage_not_found:         '❌ Booking code not found. Please check and try again, or type *0* to go back.',
    manage_invalid_status:    '⚠️ This appointment is already *{status}* and cannot be modified. Type *menu* to return.',
    manage_header:            '📋 *Your Appointment*',
    manage_option_1:          '📅 Reschedule',
    manage_option_2:          '❌ Cancel Appointment',
    manage_cancel_confirm:    '⚠️ Are you sure you want to *cancel* this appointment?\n\nReply *YES* to cancel  |  *NO* to keep it',
    cancel_scope_prompt:      '👥 This booking is part of a group of *{count}*. What would you like to cancel?',
    cancel_scope_one:         'Cancel only this appointment',
    cancel_scope_all:         'Cancel all {count} appointments',
    cancel_confirm_group:     '⚠️ Are you sure you want to *cancel all {count}* appointments?\n\nReply *YES* to cancel  |  *NO* to keep them',
    manage_cancelled_group:   '✅ All {count} appointments have been cancelled.\n\nWe hope to see you again soon! 💈 Type *menu* to return.',
    manage_cancelled:         '✅ Your appointment has been cancelled.\n\nWe hope to see you again soon! 💈 Type *menu* to return.',
    manage_rescheduled:       '🔄 *Appointment Rescheduled!*',
    manage_reschedule_confirm:'Confirm new date & time?',
    no_dates_available:       '😔 No available dates found. Please contact us directly.',

    back_to_main_menu:  'Booking cancelled — you\'re back at the main menu.',

    // Group / family booking
    group_size_prompt:  '👥 *For how many people is this appointment?*',
    group_just_me:      '1 person',
    group_people:       'people',
    group_people_lower: 'person(s)',
    group_overflow_note:'({first} together + {rest} right after)',
    group_slots_note:   '{count} barbers free at the same time',
    group_invalid:      'Please enter a number between *1* and *{max}*.',
    group_follow_up:    'follow-up slot',
    booked_header_group:'🎉 *Group Booking Confirmed! ({count} people)*',
    confirm_group:      '👥 Group',

    // Multi-person booking
    collect_person_name:    '👤 What is the {ordinal} person\'s name?',
    collect_person_service: '✂️ *Person {n} — {name}*\n\nChoose a service:',
    group_parallel_note:    '(at the same time)',
    group_sequential_note:  '(right after)',
    booked_header_multi:    '🎉 *Appointments Confirmed! ({count} people)*',
    booked_person_divider:  '─────────────────',
    multi_total_price:      '💰 *Total: {currency} {total}*',
    no_slots_multi:         '😔 No available time slots found for this combination on *{date}*. Please pick another day.',

    // Barber training
    menu_training:      '🎓 Barber Training',
    training_unavailable: '😔 No training material has been set up yet. Check back soon!',

    // Photo gallery
    menu_gallery:       '📸 Browse Styles & Gallery',
    gallery_header:     '📸 *Browse Our Styles*',
    gallery_no_tags:    '📸 No photos uploaded yet. Check back soon!',
    gallery_no_photos:  '😔 No photos found for that style. Try another category!',
    gallery_sending:    '📸 *{tag}* styles:',
    gallery_more:       '_+{count} more photos available — visit us to see them all!_',
    gallery_invalid:    'Please reply with a valid number, or *0* to go back.',

    // Blocked customer
    customer_blocked: '🚫 Your access to the booking bot has been temporarily restricted. Please contact us directly at *{phone}* to resolve this.',

    // Post-appointment survey
    survey_invalid: 'Please reply with a number between *1* and *5*.',
    survey_thanks:  '🙏 *Thank you for your feedback!*\n\n{stars} ({rating}/5)\n\nWe look forward to seeing you again! 💈',

    // Returning customer welcome (skips language selection)
    returning_welcome: '👋 *Welcome back, {name}!*\n\nGreat to see you again. How can I help you today? 💈',

    // First-time customer welcome (shown instead of normal welcome header)
    new_customer_welcome: '*Welcome to {shop_name}!*\n\nChoose a number to get started. 👇',

    // Out-of-scope freeform message at main menu
    out_of_scope: '🤔 That\'s a bit outside what I can help with here.\n\nFor specific questions, you can reach our team directly at *{phone}*.\n\nHere\'s what I *can* do for you:',

    // Financial / discount query referral
    finance_referral: '💰 Questions about *pricing, discounts or payments* are handled by our management — not the bot.\n\nPlease reach out directly:\n📱 *{phone}*\n\nType *menu* to return to the main menu.',

    // Feedback / complaints & suggestions
    menu_feedback:             '💬 Complaints & Suggestions',
    menu_privacy:              '🔒 Privacy & Policy',
    menu_house_call:           '🏠 House Call',
    feedback_header:           '💬 *Complaints & Suggestions*\n\nWhat would you like to do?',
    feedback_option_complaint: '1️⃣ File a Complaint',
    feedback_option_suggestion:'2️⃣ Share a Suggestion',
    feedback_complaint_msg:    '📞 *Complaints*\n\nFor complaints, please contact us directly:\n📱 *{phone}*\n\nWe take all complaints seriously and will get back to you as soon as possible.\n\n🏠 Type *menu* to go back.',
    feedback_suggestion_prompt:'💡 *Share Your Suggestion*\n\nType your suggestion below and we\'ll pass it on to the team:\n\n_Type *0* to go back_',
    feedback_suggestion_thanks: '✅ *Thank you for your suggestion!*\n\nWe appreciate your input and will review it. 💈\n\n🏠 Type *menu* to go back.',
    feedback_invalid:          'Please reply with *1* or *2*, or type *0* to go back.',

    yes_words:  ['yes','y'],
    no_words:   ['no','n'],
    back_words: ['0','back','b','terug'],
  },

  // ── Dutch (Nederlands) ────────────────────────────────────────────────────
  nl: {
    lang_name: 'Nederlands',

    cancelled:         '❌ Boeking geannuleerd. Typ *menu* wanneer je klaar bent! ✂️',
    invalid_menu:      'Antwoord met *1 – 9*.',
    menu_language:     'Taal Wijzigen',
    menu_manage:       'Mijn Afspraak Beheren',

    welcome:           '*Welkom bij {shop_name}!*\n\nStuur één van de onderstaande nummers naar ons voor verdere informatie👇',
    menu_book:         '📅 Afspraak Maken',
    menu_services:     '💈 Diensten & Prijzen',
    menu_hours:        '⏰ Openingstijden',
    menu_location:     '📍 Locatie',
    menu_prices:       '💰 Prijzen van Services',
    menu_contact:      '📞 Contact',
    menu_reply:        'Antwoord met een cijfer om door te gaan.',
    media_return_hint: '↩️ _Typ *menu* om terug te keren naar het hoofdmenu._',

    book_header:       '📅 *Afspraak Maken*\n\nKies een dienst:',
    services_header:   '💈 *Diensten & Prijzen*',
    reply_number:      'Antwoord met een cijfer',
    reply_or_back:     'Antwoord met een cijfer, of *0* om terug te gaan',
    more_dates:        'Typ *more* om meer beschikbare dagen te zien',
    more_times:        'Typ *more* om meer beschikbare tijden te zien',
    more_services:     'Typ *more* om meer diensten te zien',
    no_barbers_service:'😔 Sorry, geen kapper beschikbaar voor *{service}*. Neem rechtstreeks contact op.',
    invalid_choice:    'Antwoord met *1 – {max}*.',
    house_call_share_location: '🏠 *Huisbezoek*\n\nDeel uw locatie zodat we de reiskosten en extra tijd kunnen berekenen.\n\n📎 Tik op de bijlage-icoon → Locatie → Verstuur uw huidige locatie.',
    house_call_unavailable:    '😔 Helaas biedt momenteel geen enkele kapper huisbezoeken aan. Boek in plaats daarvan een afspraak in de zaak.',
    house_call_out_of_range:   '😔 Helaas valt dat buiten ons huisbezoekgebied (max {max} km). Wilt u in plaats daarvan een afspraak in de zaak boeken?',
    house_call_summary:        '🏠 *Huisbezoek*\n📍 Afstand: {km} km\n💰 Extra kosten: {currency} {fee}\n⏱️ Extra tijd: {minutes} min\n\n_Dit wordt toegevoegd aan de prijs en duur van uw afspraak._',
    booked_house_call_note:    '🏠 _We komen naar u toe — zie de locatie- en kostendetails hierboven._',
    house_call_service_name:   'Huisbezoek',

    choose_barber:     '💈 *Kies uw kapper:*',
    any_barber:        '🎲 Elke Beschikbare Kapper',
    service_label:     'Dienst',

    select_date:       '📅 *Kies een Datum*',
    no_slots_date:     '😔 Geen vrije plekken op *{date}*. Kies een andere dag.',

    select_time:       '⏰ *Beschikbare Tijden*',
    slot_taken_retry:  '😔 Sorry, dit tijdslot is zojuist door een andere klant geboekt. Kies een andere tijd.',

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
    confirm_prompt:    'Antwoord *JA* om je afspraak te bevestigen ✅\n\n*NEE* om je afspraak te annuleren ❌',
    confirm_invalid:   'Antwoord *JA* om te bevestigen of *NEE* om te annuleren.',
    confirm_cancel:    '❌ Boeking geannuleerd. Typ *1* om opnieuw te beginnen of *menu* voor het hoofdmenu.',

    booked_header:     '🎉 *Afspraak Bevestigd!*',
    booked_code:       '🎫 *Boekingscode: {code}*',
    booked_code_note:  '_Bewaar deze code — u heeft deze mogelijk nodig om te verschuiven._',
    booked_barber:     '💈 Kapper: *{barber}*',
    booked_footer_default: 'We kijken uit naar uw bezoek! ✂️',
    booked_cancel_note:    'Om te annuleren of te verschuiven, neem direct contact met ons op.',
    booked_cancel_self:    'Om te annuleren of te verschuiven, kies optie {option} in het menu.',
    payment_methods:       'Betaalwijze:\n✅ pinnen mogelijk\n✅ overmaken mogelijk\n✅ cash mogelijk',

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
    manage_list_header:       '📋 *Uw Aankomende Afspraken*\n\nKies er een om te verschuiven of te annuleren:',
    cancel_all_mine:          '🗑️ AL mijn afspraken annuleren',
    manage_no_appts:          '📋 U heeft geen aankomende afspraken onder dit nummer.\n\nAls u onder een ander nummer heeft geboekt, voer uw *4-tekens boekingscode* in, of typ *0* om terug te gaan.',
    manage_not_found:         '❌ Boekingscode niet gevonden. Controleer en probeer opnieuw, of typ *0* om terug te gaan.',
    manage_invalid_status:    '⚠️ Deze afspraak is al *{status}* en kan niet worden gewijzigd. Typ *menu* om terug te keren.',
    manage_header:            '📋 *Uw Afspraak*',
    manage_option_1:          '📅 Verschuiven',
    manage_option_2:          '❌ Afspraak Annuleren',
    manage_cancel_confirm:    '⚠️ Weet u zeker dat u deze afspraak wilt *annuleren*?\n\nAntwoord *JA* om te annuleren  |  *NEE* om te behouden',
    cancel_scope_prompt:      '👥 Deze boeking maakt deel uit van een groep van *{count}*. Wat wilt u annuleren?',
    cancel_scope_one:         'Alleen deze afspraak annuleren',
    cancel_scope_all:         'Alle {count} afspraken annuleren',
    cancel_confirm_group:     '⚠️ Weet u zeker dat u *alle {count}* afspraken wilt *annuleren*?\n\nAntwoord *JA* om te annuleren  |  *NEE* om te behouden',
    manage_cancelled_group:   '✅ Alle {count} afspraken zijn geannuleerd.\n\nWe hopen u snel weer te zien! 💈 Typ *menu* om terug te keren.',
    manage_cancelled:         '✅ Uw afspraak is geannuleerd.\n\nWij hopen u snel weer te zien! 💈 Typ *menu* om terug te keren.',
    manage_rescheduled:       '🔄 *Afspraak Verschoven!*',
    manage_reschedule_confirm:'Nieuwe datum & tijd bevestigen?',
    no_dates_available:       '😔 Geen beschikbare datums gevonden. Neem rechtstreeks contact op.',

    back_to_main_menu:  'Boeking geannuleerd — u bent terug in het hoofdmenu.',

    // Group / family booking
    group_size_prompt:  '👥 *Voor hoeveel personen is deze afspraak?*',
    group_just_me:      '1 persoon',
    group_people:       'personen',
    group_people_lower: 'persoon/personen',
    group_overflow_note:'({first} tegelijk + {rest} daarna)',
    group_slots_note:   '{count} kappers tegelijk beschikbaar',
    group_invalid:      'Voer een getal in tussen *1* en *{max}*.',
    group_follow_up:    'vervolg afspraak',
    booked_header_group:'🎉 *Groepsboeking Bevestigd! ({count} personen)*',
    confirm_group:      '👥 Groep',

    // Multi-person booking
    collect_person_name:    '👤 Naam van de {ordinal} persoon?',
    collect_person_service: '✂️ *Persoon {n} — {name}*\n\nKies een dienst:',
    group_parallel_note:    '(tegelijk)',
    group_sequential_note:  '(direct daarna)',
    booked_header_multi:    '🎉 *Afspraken Bevestigd! ({count} personen)*',
    booked_person_divider:  '─────────────────',
    multi_total_price:      '💰 *Totaal: {currency} {total}*',
    no_slots_multi:         '😔 Geen beschikbare tijdsloten gevonden voor deze combinatie op *{date}*. Kies een andere dag.',

    // Barber training
    menu_training:      '🎓 Kapperstraining',
    training_unavailable: '😔 Er is nog geen trainingsmateriaal beschikbaar. Kijk later nog eens!',

    // Photo gallery
    menu_gallery:       '📸 Stijlen & Galerij Bekijken',
    gallery_header:     '📸 *Onze Stijlen*',
    gallery_no_tags:    '📸 Nog geen foto\'s beschikbaar. Kom binnenkort terug!',
    gallery_no_photos:  '😔 Geen foto\'s gevonden voor die stijl. Probeer een andere categorie!',
    gallery_sending:    '📸 *{tag}* stijlen:',
    gallery_more:       '_+{count} meer foto\'s beschikbaar — bezoek ons om ze allemaal te zien!_',
    gallery_invalid:    'Antwoord met een geldig getal, of *0* om terug te gaan.',

    // Blocked customer
    customer_blocked: '🚫 Uw toegang tot de boekingsbot is tijdelijk beperkt. Neem rechtstreeks contact met ons op via *{phone}*.',

    // Post-appointment survey
    survey_invalid: 'Antwoord met een getal tussen *1* en *5*.',
    survey_thanks:  '🙏 *Bedankt voor uw feedback!*\n\n{stars} ({rating}/5)\n\nWij kijken uit naar uw volgende bezoek! 💈',

    // Returning customer welcome
    returning_welcome: '👋 *Welkom terug, {name}!*\n\nFijn u weer te zien. Hoe kan ik u helpen vandaag? 💈',

    // First-time customer welcome
    new_customer_welcome: '*Welkom bij {shop_name}!*\n\nKies een nummer om te beginnen. 👇',

    // Out-of-scope freeform message at main menu
    out_of_scope: '🤔 Dat valt buiten wat ik hier kan regelen.\n\nVoor specifieke vragen kunt u ons team bereiken via *{phone}*.\n\nHier is wat ik *wel* voor u kan doen:',

    // Financial / discount query referral
    finance_referral: '💰 Vragen over *prijzen, kortingen of betalingen* worden afgehandeld door onze manager — niet door de bot.\n\nNeem rechtstreeks contact op:\n📱 *{phone}*\n\nTyp *menu* om terug te gaan.',

    // Feedback / klachten & suggesties
    menu_feedback:             '💬 Klachten & Suggesties',
    menu_privacy:              '🔒 Privacy & Beleid',
    menu_house_call:           '🏠 Huisbezoek',
    feedback_header:           '💬 *Klachten & Suggesties*\n\nWat wilt u doen?',
    feedback_option_complaint: '1️⃣ Klacht Indienen',
    feedback_option_suggestion:'2️⃣ Suggestie Delen',
    feedback_complaint_msg:    '📞 *Klachten*\n\nVoor klachten kunt u ons rechtstreeks bereiken:\n📱 *{phone}*\n\nWij nemen elke klacht serieus en nemen zo snel mogelijk contact met u op.\n\n🏠 Typ *menu* om terug te gaan.',
    feedback_suggestion_prompt:'💡 *Deel Uw Suggestie*\n\nTyp uw suggestie hieronder en wij sturen het door naar het team:\n\n_Typ *0* om terug te gaan_',
    feedback_suggestion_thanks: '✅ *Bedankt voor uw suggestie!*\n\nWij waarderen uw inbreng en zullen het bekijken. 💈\n\n🏠 Typ *menu* om terug te gaan.',
    feedback_invalid:          'Antwoord met *1* of *2*, of typ *0* om terug te gaan.',

    yes_words:  ['ja','j','yes','y'],
    no_words:   ['nee','n','no'],
    back_words: ['0','terug','back','b'],
  },

  // ── Spanish (Español) ─────────────────────────────────────────────────────
  es: {
    lang_name: 'Español',

    cancelled:         '❌ Reserva cancelada. ¡Escribe *menú* cuando estés listo! ✂️',
    invalid_menu:      'Por favor responde con *1 – 9*.',
    menu_language:     'Cambiar Idioma',
    menu_manage:       'Gestionar Mi Cita',

    welcome:           '*¡Bienvenido a {shop_name}!*\n\nElige un número para empezar. 👇',
    menu_book:         '📅 Reservar Cita',
    menu_services:     '💈 Servicios & Precios',
    menu_hours:        '⏰ Horario de Atención',
    menu_location:     '📍 Ubicación',
    menu_prices:       '💰 Precios de Servicios',
    menu_contact:      '📞 Contáctenos',
    menu_reply:        'Responde con un número para continuar.',
    media_return_hint: '↩️ _Escribe *menú* para volver al menú principal._',

    book_header:       '📅 *Reservar Cita*\n\nSelecciona un servicio:',
    services_header:   '💈 *Servicios & Precios*',
    reply_number:      'Responde con un número',
    reply_or_back:     'Responde con un número, o *0* para volver',
    more_dates:        'Escribe *more* para ver más fechas',
    more_times:        'Escribe *more* para ver más horarios',
    more_services:     'Escribe *more* para ver más servicios',
    no_barbers_service:'😔 Lo sentimos, no hay barberos disponibles para *{service}*. Contáctenos directamente.',
    invalid_choice:    'Por favor responde con *1 – {max}*.',
    house_call_share_location: '🏠 *Visita a Domicilio*\n\nComparta su ubicación para calcular la tarifa y el tiempo de viaje.\n\n📎 Toque el icono de adjuntar → Ubicación → Enviar su ubicación actual.',
    house_call_unavailable:    '😔 Lo sentimos, actualmente ningún barbero ofrece visitas a domicilio. Por favor reserve una cita en el local.',
    house_call_out_of_range:   '😔 Lo sentimos, eso está fuera de nuestra zona de visitas a domicilio (máx {max} km). ¿Desea reservar una cita en el local en su lugar?',
    house_call_summary:        '🏠 *Visita a Domicilio*\n📍 Distancia: {km} km\n💰 Tarifa extra: {currency} {fee}\n⏱️ Tiempo extra: {minutes} min\n\n_Esto se suma al precio y duración de su servicio._',
    booked_house_call_note:    '🏠 _Iremos a usted — vea los detalles de ubicación y tarifa arriba._',
    house_call_service_name:   'Visita a Domicilio',

    choose_barber:     '💈 *Elige tu barbero:*',
    any_barber:        '🎲 Cualquier Barbero Disponible',
    service_label:     'Servicio',

    select_date:       '📅 *Selecciona una Fecha*',
    no_slots_date:     '😔 No hay horarios disponibles el *{date}*. Por favor elige otro día.',

    select_time:       '⏰ *Horarios Disponibles*',
    slot_taken_retry:  '😔 Lo sentimos, otro cliente acaba de reservar ese horario. Por favor elige otra hora.',

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
    confirm_prompt:    'Responde *SÍ* para confirmar tu cita ✅\n\n*NO* para cancelar tu cita ❌',
    confirm_invalid:   'Por favor responde *SÍ* para confirmar o *NO* para cancelar.',
    confirm_cancel:    '❌ Reserva cancelada. Escribe *1* para empezar de nuevo o *menú* para el menú principal.',

    booked_header:     '🎉 *¡Cita Confirmada!*',
    booked_code:       '🎫 *Código de Reserva: {code}*',
    booked_code_note:  '_Guarda este código — puede que lo necesites para reprogramar._',
    booked_barber:     '💈 Barbero: *{barber}*',
    booked_footer_default: '¡Esperamos verte pronto! ✂️',
    booked_cancel_note:    'Para cancelar o reprogramar, contáctanos directamente.',
    booked_cancel_self:    'Para cancelar o reprogramar, elige la opción {option} en el menú.',
    payment_methods:       'Métodos de pago:\n✅ pago con tarjeta (PIN) disponible\n✅ transferencia bancaria disponible\n✅ efectivo disponible',

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
    manage_list_header:       '📋 *Tus Próximas Citas*\n\nSelecciona una para reprogramar o cancelar:',
    cancel_all_mine:          '🗑️ Cancelar TODAS mis citas',
    manage_no_appts:          '📋 No tienes citas próximas con este número.\n\nSi reservaste con otro número, ingresa tu *código de reserva de 4 caracteres*, o escribe *0* para volver.',
    manage_not_found:         '❌ Código de reserva no encontrado. Verifica e inténtalo de nuevo, o escribe *0* para volver.',
    manage_invalid_status:    '⚠️ Esta cita ya está *{status}* y no puede modificarse. Escribe *menú* para volver.',
    manage_header:            '📋 *Tu Cita*',
    manage_option_1:          '📅 Reprogramar',
    manage_option_2:          '❌ Cancelar Cita',
    manage_cancel_confirm:    '⚠️ ¿Estás seguro de que quieres *cancelar* esta cita?\n\nResponde *SÍ* para cancelar  |  *NO* para conservarla',
    cancel_scope_prompt:      '👥 Esta reserva es parte de un grupo de *{count}*. ¿Qué deseas cancelar?',
    cancel_scope_one:         'Cancelar solo esta cita',
    cancel_scope_all:         'Cancelar las {count} citas',
    cancel_confirm_group:     '⚠️ ¿Seguro que quieres *cancelar las {count}* citas?\n\nResponde *SÍ* para cancelar  |  *NO* para conservarlas',
    manage_cancelled_group:   '✅ Las {count} citas han sido canceladas.\n\n¡Esperamos verte pronto! 💈 Escribe *menú* para volver.',
    manage_cancelled:         '✅ Tu cita ha sido cancelada.\n\n¡Esperamos verte pronto! 💈 Escribe *menú* para volver.',
    manage_rescheduled:       '🔄 *¡Cita Reprogramada!*',
    manage_reschedule_confirm:'¿Confirmas la nueva fecha y hora?',
    no_dates_available:       '😔 No hay fechas disponibles. Contáctanos directamente.',

    back_to_main_menu:  'Reserva cancelada — está de vuelta en el menú principal.',

    // Group / family booking
    group_size_prompt:  '👥 *¿Para cuántas personas es esta cita?*',
    group_just_me:      '1 persona',
    group_people:       'personas',
    group_people_lower: 'persona(s)',
    group_overflow_note:'({first} juntas + {rest} justo después)',
    group_slots_note:   '{count} barberos libres al mismo tiempo',
    group_invalid:      'Por favor ingresa un número entre *1* y *{max}*.',
    group_follow_up:    'turno siguiente',
    booked_header_group:'🎉 *¡Reserva Grupal Confirmada! ({count} personas)*',
    confirm_group:      '👥 Grupo',

    // Multi-person booking
    collect_person_name:    '👤 ¿Cuál es el nombre de la {ordinal} persona?',
    collect_person_service: '✂️ *Persona {n} — {name}*\n\nElige un servicio:',
    group_parallel_note:    '(al mismo tiempo)',
    group_sequential_note:  '(justo después)',
    booked_header_multi:    '🎉 *¡Citas Confirmadas! ({count} personas)*',
    booked_person_divider:  '─────────────────',
    multi_total_price:      '💰 *Total: {currency} {total}*',
    no_slots_multi:         '😔 No se encontraron franjas horarias disponibles para esta combinación en *{date}*. Elige otro día.',

    // Barber training
    menu_training:      '🎓 Capacitación de Barberos',
    training_unavailable: '😔 Aún no hay material de capacitación disponible. ¡Vuelve pronto!',

    // Photo gallery
    menu_gallery:       '📸 Ver Estilos y Galería',
    gallery_header:     '📸 *Nuestros Estilos*',
    gallery_no_tags:    '📸 Aún no hay fotos disponibles. ¡Vuelve pronto!',
    gallery_no_photos:  '😔 No se encontraron fotos para ese estilo. ¡Prueba otra categoría!',
    gallery_sending:    '📸 Estilos de *{tag}*:',
    gallery_more:       '_+{count} fotos más disponibles — ¡visítanos para verlas todas!_',
    gallery_invalid:    'Por favor responde con un número válido, o *0* para volver.',

    // Blocked customer
    customer_blocked: '🚫 Tu acceso al bot de reservas ha sido temporalmente restringido. Contáctanos directamente en *{phone}*.',

    // Post-appointment survey
    survey_invalid: 'Por favor responde con un número entre *1* y *5*.',
    survey_thanks:  '🙏 *¡Gracias por tu opinión!*\n\n{stars} ({rating}/5)\n\n¡Esperamos verte pronto! 💈',

    // Returning customer welcome
    returning_welcome: '👋 *¡Bienvenido de vuelta, {name}!*\n\nQué gusto verte de nuevo. ¿En qué puedo ayudarte hoy? 💈',

    // First-time customer welcome
    new_customer_welcome: '*¡Bienvenido a {shop_name}!*\n\nElige un número para empezar. 👇',

    // Out-of-scope freeform message at main menu
    out_of_scope: '🤔 Eso está un poco fuera de lo que puedo ayudarte aquí.\n\nPara preguntas específicas, puedes contactar a nuestro equipo en *{phone}*.\n\nAquí está lo que *sí* puedo hacer:',

    // Financial / discount query referral
    finance_referral: '💰 Las preguntas sobre *precios, descuentos o pagos* las maneja nuestra gerencia — no el bot.\n\nContáctalos directamente:\n📱 *{phone}*\n\nEscribe *menú* para volver al menú principal.',

    // Feedback
    menu_feedback:             '💬 Quejas & Sugerencias',
    menu_privacy:              '🔒 Privacidad & Política',
    menu_house_call:           '🏠 Visita a Domicilio',
    feedback_header:           '💬 *Quejas & Sugerencias*\n\n¿Qué deseas hacer?',
    feedback_option_complaint: '1️⃣ Presentar una Queja',
    feedback_option_suggestion:'2️⃣ Compartir una Sugerencia',
    feedback_complaint_msg:    '📞 *Quejas*\n\nPara quejas, contáctanos directamente:\n📱 *{phone}*\n\nTomamos todas las quejas en serio y nos pondremos en contacto contigo lo antes posible.\n\n🏠 Escribe *menú* para volver.',
    feedback_suggestion_prompt:'💡 *Comparte tu Sugerencia*\n\nEscribe tu sugerencia a continuación y la enviaremos al equipo:\n\n_Escribe *0* para volver_',
    feedback_suggestion_thanks: '✅ *¡Gracias por tu sugerencia!*\n\nApreciamos tu aporte y lo revisaremos. 💈\n\n🏠 Escribe *menú* para volver.',
    feedback_invalid:          'Por favor responde con *1* o *2*, o escribe *0* para volver.',

    yes_words:  ['si','sí','s','yes','y'],
    no_words:   ['no','n'],
    back_words: ['0','volver','back','b'],
  },

  // ── French (Français) ─────────────────────────────────────────────────────
  fr: {
    lang_name: 'Français',

    cancelled:         '❌ Réservation annulée. Tapez *menu* quand vous êtes prêt ! ✂️',
    invalid_menu:      'Veuillez répondre avec *1 – 9*.',
    menu_language:     'Changer de Langue',
    menu_manage:       'Gérer Mon Rendez-vous',

    welcome:           '*Bienvenue chez {shop_name} !*\n\nChoisissez un numéro pour commencer. 👇',
    menu_book:         '📅 Prendre Rendez-vous',
    menu_services:     '💈 Nos Services & Tarifs',
    menu_hours:        '⏰ Heures d\'Ouverture',
    menu_location:     '📍 Adresse',
    menu_prices:       '💰 Tarifs des Services',
    menu_contact:      '📞 Nous Contacter',
    menu_reply:        'Répondez avec un numéro pour continuer.',
    media_return_hint: '↩️ _Tapez *menu* pour revenir au menu principal._',

    book_header:       '📅 *Prendre Rendez-vous*\n\nChoisissez un service :',
    services_header:   '💈 *Services & Tarifs*',
    reply_number:      'Répondez avec un numéro',
    reply_or_back:     'Répondez avec un numéro, ou *0* pour revenir',
    more_dates:        'Tapez *more* pour voir plus de dates',
    more_times:        'Tapez *more* pour voir plus d\'horaires',
    more_services:     'Tapez *more* pour voir plus de services',
    no_barbers_service:'😔 Désolé, aucun barbier n\'est disponible pour *{service}*. Veuillez nous contacter directement.',
    invalid_choice:    'Veuillez répondre avec *1 – {max}*.',
    house_call_share_location: '🏠 *Visite à Domicile*\n\nPartagez votre position pour que nous puissions calculer les frais et le temps de trajet.\n\n📎 Appuyez sur l\'icône trombone → Position → Envoyer votre position actuelle.',
    house_call_unavailable:    '😔 Désolé, aucun barbier ne propose actuellement de visites à domicile. Veuillez réserver un rendez-vous en boutique.',
    house_call_out_of_range:   '😔 Désolé, c\'est en dehors de notre zone de visite à domicile (max {max} km). Souhaitez-vous réserver un rendez-vous en boutique à la place ?',
    house_call_summary:        '🏠 *Visite à Domicile*\n📍 Distance : {km} km\n💰 Frais supplémentaires : {currency} {fee}\n⏱️ Temps supplémentaire : {minutes} min\n\n_Ceci s\'ajoute au prix et à la durée de votre service._',
    booked_house_call_note:    '🏠 _Nous viendrons à vous — voir les détails de localisation et de frais ci-dessus._',
    house_call_service_name:   'Visite à Domicile',

    choose_barber:     '💈 *Choisissez votre barbier :*',
    any_barber:        '🎲 N\'importe quel Barbier Disponible',
    service_label:     'Service',

    select_date:       '📅 *Choisissez une Date*',
    no_slots_date:     '😔 Aucun créneau disponible le *{date}*. Veuillez choisir un autre jour.',

    select_time:       '⏰ *Créneaux Disponibles*',
    slot_taken_retry:  '😔 Désolé, ce créneau vient d\'être réservé par un autre client. Veuillez choisir une autre heure.',

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
    confirm_prompt:    'Répondez *OUI* pour confirmer votre rendez-vous ✅\n\n*NON* pour annuler votre rendez-vous ❌',
    confirm_invalid:   'Veuillez répondre *OUI* pour confirmer ou *NON* pour annuler.',
    confirm_cancel:    '❌ Réservation annulée. Tapez *1* pour recommencer ou *menu* pour le menu principal.',

    booked_header:     '🎉 *Rendez-vous Confirmé !*',
    booked_code:       '🎫 *Code de Réservation : {code}*',
    booked_code_note:  '_Conservez ce code — vous pourriez en avoir besoin pour reprogrammer._',
    booked_barber:     '💈 Barbier : *{barber}*',
    booked_footer_default: 'Nous avons hâte de vous voir ! ✂️',
    booked_cancel_note:    'Pour annuler ou reporter, contactez-nous directement.',
    booked_cancel_self:    'Pour annuler ou reporter, choisissez l\'option {option} dans le menu.',
    payment_methods:       'Moyens de paiement :\n✅ paiement par carte (PIN) possible\n✅ virement bancaire possible\n✅ paiement en espèces possible',

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
    manage_list_header:       '📋 *Vos Prochains Rendez-vous*\n\nSélectionnez-en un à reporter ou annuler :',
    cancel_all_mine:          '🗑️ Annuler TOUS mes rendez-vous',
    manage_no_appts:          '📋 Vous n\'avez aucun rendez-vous à venir sous ce numéro.\n\nSi vous avez réservé sous un autre numéro, entrez votre *code de réservation de 4 caractères*, ou tapez *0* pour revenir.',
    manage_not_found:         '❌ Code de réservation introuvable. Vérifiez et réessayez, ou tapez *0* pour revenir.',
    manage_invalid_status:    '⚠️ Ce rendez-vous est déjà *{status}* et ne peut pas être modifié. Tapez *menu* pour revenir.',
    manage_header:            '📋 *Votre Rendez-vous*',
    manage_option_1:          '📅 Reporter',
    manage_option_2:          '❌ Annuler le Rendez-vous',
    manage_cancel_confirm:    '⚠️ Êtes-vous sûr de vouloir *annuler* ce rendez-vous ?\n\nRépondez *OUI* pour annuler  |  *NON* pour le conserver',
    cancel_scope_prompt:      '👥 Cette réservation fait partie d\'un groupe de *{count}*. Que souhaitez-vous annuler ?',
    cancel_scope_one:         'Annuler uniquement ce rendez-vous',
    cancel_scope_all:         'Annuler les {count} rendez-vous',
    cancel_confirm_group:     '⚠️ Êtes-vous sûr de vouloir *annuler les {count}* rendez-vous ?\n\nRépondez *OUI* pour annuler  |  *NON* pour les conserver',
    manage_cancelled_group:   '✅ Les {count} rendez-vous ont été annulés.\n\nNous espérons vous revoir bientôt ! 💈 Tapez *menu* pour revenir.',
    manage_cancelled:         '✅ Votre rendez-vous a été annulé.\n\nNous espérons vous revoir bientôt ! 💈 Tapez *menu* pour revenir.',
    manage_rescheduled:       '🔄 *Rendez-vous Reporté !*',
    manage_reschedule_confirm:'Confirmez la nouvelle date et heure ?',
    no_dates_available:       '😔 Aucune date disponible. Veuillez nous contacter directement.',

    back_to_main_menu:  'Réservation annulée — vous êtes de retour au menu principal.',

    // Group / family booking
    group_size_prompt:  '👥 *Pour combien de personnes est ce rendez-vous ?*',
    group_just_me:      '1 personne',
    group_people:       'personnes',
    group_people_lower: 'personne(s)',
    group_overflow_note:'({first} ensemble + {rest} juste après)',
    group_slots_note:   '{count} barbiers disponibles simultanément',
    group_invalid:      'Veuillez entrer un nombre entre *1* et *{max}*.',
    group_follow_up:    'suite du rendez-vous',
    booked_header_group:'🎉 *Réservation Groupée Confirmée ! ({count} personnes)*',
    confirm_group:      '👥 Groupe',

    // Multi-person booking
    collect_person_name:    '👤 Quel est le nom de la {ordinal} personne ?',
    collect_person_service: '✂️ *Personne {n} — {name}*\n\nChoisissez un service :',
    group_parallel_note:    '(en même temps)',
    group_sequential_note:  '(juste après)',
    booked_header_multi:    '🎉 *Rendez-vous Confirmés ! ({count} personnes)*',
    booked_person_divider:  '─────────────────',
    multi_total_price:      '💰 *Total : {currency} {total}*',
    no_slots_multi:         '😔 Aucun créneau disponible pour cette combinaison le *{date}*. Veuillez choisir un autre jour.',

    // Barber training
    menu_training:      '🎓 Formation Barbier',
    training_unavailable: '😔 Aucun matériel de formation n\'est disponible pour le moment. Revenez bientôt !',

    // Photo gallery
    menu_gallery:       '📸 Voir Styles & Galerie',
    gallery_header:     '📸 *Nos Styles*',
    gallery_no_tags:    '📸 Aucune photo disponible pour l\'instant. Revenez bientôt !',
    gallery_no_photos:  '😔 Aucune photo trouvée pour ce style. Essayez une autre catégorie !',
    gallery_sending:    '📸 Styles *{tag}* :',
    gallery_more:       '_+{count} photos disponibles — venez nous rendre visite pour les voir toutes !_',
    gallery_invalid:    'Veuillez répondre avec un numéro valide, ou *0* pour revenir.',

    // Blocked customer
    customer_blocked: '🚫 Votre accès au bot de réservation a été temporairement restreint. Veuillez nous contacter directement au *{phone}*.',

    // Post-appointment survey
    survey_invalid: 'Veuillez répondre avec un nombre entre *1* et *5*.',
    survey_thanks:  '🙏 *Merci pour votre retour !*\n\n{stars} ({rating}/5)\n\nNous avons hâte de vous revoir ! 💈',

    // Returning customer welcome
    returning_welcome: '👋 *Bon retour, {name} !*\n\nRavi de vous revoir. Comment puis-je vous aider aujourd\'hui ? 💈',

    // First-time customer welcome
    new_customer_welcome: '*Bienvenue chez {shop_name} !*\n\nChoisissez un numéro pour commencer. 👇',

    // Out-of-scope freeform message at main menu
    out_of_scope: '🤔 Cela dépasse un peu ce que je peux faire ici.\n\nPour des questions spécifiques, contactez notre équipe au *{phone}*.\n\nVoici ce que je peux *faire* pour vous :',

    // Financial / discount query referral
    finance_referral: '💰 Les questions sur les *tarifs, réductions ou paiements* sont gérées par notre direction — pas par le bot.\n\nContactez-les directement :\n📱 *{phone}*\n\nTapez *menu* pour revenir au menu principal.',

    // Feedback
    menu_feedback:             '💬 Plaintes & Suggestions',
    menu_privacy:              '🔒 Confidentialité & Règlement',
    menu_house_call:           '🏠 Visite à Domicile',
    feedback_header:           '💬 *Plaintes & Suggestions*\n\nQue souhaitez-vous faire ?',
    feedback_option_complaint: '1️⃣ Déposer une Plainte',
    feedback_option_suggestion:'2️⃣ Partager une Suggestion',
    feedback_complaint_msg:    '📞 *Plaintes*\n\nPour les plaintes, veuillez nous contacter directement :\n📱 *{phone}*\n\nNous prenons toutes les plaintes au sérieux et vous répondrons dès que possible.\n\n🏠 Tapez *menu* pour revenir.',
    feedback_suggestion_prompt:'💡 *Partagez votre Suggestion*\n\nTapez votre suggestion ci-dessous et nous la transmettrons à l\'équipe :\n\n_Tapez *0* pour revenir_',
    feedback_suggestion_thanks: '✅ *Merci pour votre suggestion !*\n\nNous apprécions votre contribution et allons l\'examiner. 💈\n\n🏠 Tapez *menu* pour revenir.',
    feedback_invalid:          'Veuillez répondre avec *1* ou *2*, ou tapez *0* pour revenir.',

    yes_words:  ['oui','o','yes','y'],
    no_words:   ['non','no','n'],
    back_words: ['0','retour','back','b'],
  },

  // ── Portuguese (Português) ────────────────────────────────────────────────
  pt: {
    lang_name: 'Português',

    cancelled:         '❌ Reserva cancelada. Digite *menu* quando estiver pronto! ✂️',
    invalid_menu:      'Por favor responda com *1 – 9*.',
    menu_language:     'Mudar Idioma',
    menu_manage:       'Gerenciar Meu Agendamento',

    welcome:           '*Bem-vindo ao {shop_name}!*\n\nEscolha um número para começar. 👇',
    menu_book:         '📅 Agendar Horário',
    menu_services:     '💈 Nossos Serviços & Preços',
    menu_hours:        '⏰ Horário de Funcionamento',
    menu_location:     '📍 Localização',
    menu_prices:       '💰 Preços dos Serviços',
    menu_contact:      '📞 Contato',
    menu_reply:        'Responda com um número para continuar.',
    media_return_hint: '↩️ _Digite *menu* para voltar ao menu principal._',

    book_header:       '📅 *Agendar Horário*\n\nEscolha um serviço:',
    services_header:   '💈 *Serviços & Preços*',
    reply_number:      'Responda com um número',
    reply_or_back:     'Responda com um número, ou *0* para voltar',
    more_dates:        'Digite *more* para ver mais datas',
    more_times:        'Digite *more* para ver mais horários',
    more_services:     'Digite *more* para ver mais serviços',
    no_barbers_service:'😔 Desculpe, nenhum barbeiro disponível para *{service}*. Por favor contate-nos diretamente.',
    invalid_choice:    'Por favor responda com *1 – {max}*.',
    house_call_share_location: '🏠 *Visita Domiciliar*\n\nPor favor compartilhe sua localização para calcularmos a taxa e o tempo de deslocamento.\n\n📎 Toque no ícone de anexo → Localização → Enviar sua localização atual.',
    house_call_unavailable:    '😔 Desculpe, nenhum barbeiro oferece visitas domiciliares no momento. Por favor agende um atendimento na loja.',
    house_call_out_of_range:   '😔 Desculpe, isso está fora da nossa área de visitas domiciliares (máx {max} km). Deseja agendar um atendimento na loja?',
    house_call_summary:        '🏠 *Visita Domiciliar*\n📍 Distância: {km} km\n💰 Taxa extra: {currency} {fee}\n⏱️ Tempo extra: {minutes} min\n\n_Isso é adicionado ao preço e duração do seu serviço._',
    booked_house_call_note:    '🏠 _Iremos até você — veja os detalhes de localização e taxa acima._',
    house_call_service_name:   'Visita Domiciliar',

    choose_barber:     '💈 *Escolha seu barbeiro:*',
    any_barber:        '🎲 Qualquer Barbeiro Disponível',
    service_label:     'Serviço',

    select_date:       '📅 *Escolha uma Data*',
    no_slots_date:     '😔 Nenhum horário disponível em *{date}*. Por favor escolha outro dia.',

    select_time:       '⏰ *Horários Disponíveis*',
    slot_taken_retry:  '😔 Desculpe, esse horário acabou de ser reservado por outro cliente. Por favor escolha outro horário.',

    enter_name:        '👤 *Quase lá!*\n\nDigite seu *nome completo* para confirmar sua reserva:',
    name_too_short:    '✏️ Por favor insira seu *nome completo* para continuar.',

    confirm_header:    '✅ *Resumo do Agendamento*',
    confirm_name:      '👤 Nome',
    confirm_barber:    '💈 Barbeiro',
    confirm_service:   'Serviço',
    confirm_date:      '📅 Data',
    confirm_time:      '⏰ Hora',
    confirm_duration:  '⏱️ Duração',
    confirm_price:     '💰 Preço',
    confirm_prompt:    'Responda *SIM* para confirmar seu agendamento ✅\n\n*NÃO* para cancelar seu agendamento ❌',
    confirm_invalid:   'Por favor responda *SIM* para confirmar ou *NÃO* para cancelar.',
    confirm_cancel:    '❌ Reserva cancelada. Digite *1* para recomeçar ou *menu* para o menu principal.',

    booked_header:     '🎉 *Agendamento Confirmado!*',
    booked_code:       '🎫 *Código de Reserva: {code}*',
    booked_code_note:  '_Guarde este código — pode ser necessário para reagendar._',
    booked_barber:     '💈 Barbeiro: *{barber}*',
    booked_footer_default: 'Estamos ansiosos para vê-lo! ✂️',
    booked_cancel_note:    'Para cancelar ou remarcar, entre em contato conosco diretamente.',
    booked_cancel_self:    'Para cancelar ou remarcar, escolha a opção {option} no menu.',
    payment_methods:       'Formas de pagamento:\n✅ pagamento com cartão (PIN) disponível\n✅ transferência bancária disponível\n✅ dinheiro disponível',

    hours_header:      '⏰ *Horário de Funcionamento*',
    hours_back:        '🏠 Digite *menu* para voltar',
    hours_closed:      'Fechado',
    location_header:   '📍 *Localização*',
    contact_header:    '📞 *Contato*',
    contact_phone:     '📱 WhatsApp / Telefone',
    contact_email:     '📧 E-mail',
    contact_instagram: '📸 Instagram',
    back_menu:         '🏠 Digite *menu* para voltar',
    book_prompt:       '📅 Digite *1* para agendar',

    days: ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'],

    calendar_invite_note: '📆 Um convite de calendário está anexado — toque para salvar no Google ou Apple Calendário.',

    manage_prompt:            '📋 *Gerenciar Agendamento*\n\nInsira seu *código de reserva de 4 caracteres*:\n\n_Digite *0* para voltar_',
    manage_list_header:       '📋 *Seus Próximos Agendamentos*\n\nSelecione um para remarcar ou cancelar:',
    cancel_all_mine:          '🗑️ Cancelar TODOS os meus agendamentos',
    manage_no_appts:          '📋 Você não tem agendamentos futuros neste número.\n\nSe agendou com outro número, insira seu *código de reserva de 4 caracteres*, ou digite *0* para voltar.',
    manage_not_found:         '❌ Código de reserva não encontrado. Verifique e tente novamente, ou digite *0* para voltar.',
    manage_invalid_status:    '⚠️ Este agendamento já está *{status}* e não pode ser modificado. Digite *menu* para voltar.',
    manage_header:            '📋 *Seu Agendamento*',
    manage_option_1:          '📅 Reagendar',
    manage_option_2:          '❌ Cancelar Agendamento',
    manage_cancel_confirm:    '⚠️ Tem certeza que deseja *cancelar* este agendamento?\n\nResponda *SIM* para cancelar  |  *NÃO* para manter',
    cancel_scope_prompt:      '👥 Este agendamento faz parte de um grupo de *{count}*. O que deseja cancelar?',
    cancel_scope_one:         'Cancelar apenas este agendamento',
    cancel_scope_all:         'Cancelar todos os {count} agendamentos',
    cancel_confirm_group:     '⚠️ Tem certeza que deseja *cancelar todos os {count}* agendamentos?\n\nResponda *SIM* para cancelar  |  *NÃO* para manter',
    manage_cancelled_group:   '✅ Todos os {count} agendamentos foram cancelados.\n\nEsperamos vê-lo em breve! 💈 Digite *menu* para voltar.',
    manage_cancelled:         '✅ Seu agendamento foi cancelado.\n\nEsperamos vê-lo em breve! 💈 Digite *menu* para voltar.',
    manage_rescheduled:       '🔄 *Agendamento Reagendado!*',
    manage_reschedule_confirm:'Confirmar nova data e hora?',
    no_dates_available:       '😔 Nenhuma data disponível. Por favor contate-nos diretamente.',

    back_to_main_menu:  'Reserva cancelada — você voltou ao menu principal.',

    group_size_prompt:  '👥 *Para quantas pessoas é este agendamento?*',
    group_just_me:      '1 pessoa',
    group_people:       'pessoas',
    group_people_lower: 'pessoa(s)',
    group_overflow_note:'({first} juntos + {rest} logo após)',
    group_slots_note:   '{count} barbeiros disponíveis simultaneamente',
    group_invalid:      'Por favor insira um número entre *1* e *{max}*.',
    group_follow_up:    'continuação do agendamento',
    booked_header_group:'🎉 *Agendamento em Grupo Confirmado! ({count} pessoas)*',
    confirm_group:      '👥 Grupo',

    // Multi-person booking
    collect_person_name:    '👤 Qual é o nome da {ordinal} pessoa?',
    collect_person_service: '✂️ *Pessoa {n} — {name}*\n\nEscolha um serviço:',
    group_parallel_note:    '(ao mesmo tempo)',
    group_sequential_note:  '(logo em seguida)',
    booked_header_multi:    '🎉 *Agendamentos Confirmados! ({count} pessoas)*',
    booked_person_divider:  '─────────────────',
    multi_total_price:      '💰 *Total: {currency} {total}*',
    no_slots_multi:         '😔 Nenhum horário disponível para esta combinação em *{date}*. Por favor escolha outro dia.',

    menu_training:      '🎓 Treinamento de Barbeiro',
    training_unavailable: '😔 Nenhum material de treinamento disponível no momento. Volte em breve!',

    menu_gallery:       '📸 Ver Estilos & Galeria',
    gallery_header:     '📸 *Nossos Estilos*',
    gallery_no_tags:    '📸 Nenhuma foto disponível por enquanto. Volte em breve!',
    gallery_no_photos:  '😔 Nenhuma foto encontrada para este estilo. Tente outra categoria!',
    gallery_sending:    '📸 Estilos *{tag}*:',
    gallery_more:       '_+{count} fotos disponíveis — venha nos visitar para ver todas!_',
    gallery_invalid:    'Por favor responda com um número válido, ou *0* para voltar.',

    customer_blocked: '🚫 Seu acesso ao bot de reservas foi temporariamente restrito. Por favor contate-nos diretamente no *{phone}*.',

    survey_invalid: 'Por favor responda com um número entre *1* e *5*.',
    survey_thanks:  '🙏 *Obrigado pelo seu feedback!*\n\n{stars} ({rating}/5)\n\nEsperamos vê-lo novamente! 💈',

    returning_welcome: '👋 *Bem-vindo de volta, {name}!*\n\nQue bom ver você novamente. Como posso ajudá-lo hoje? 💈',

    new_customer_welcome: '*Bem-vindo ao {shop_name}!*\n\nEscolha um número para começar. 👇',

    out_of_scope: '🤔 Isso está um pouco além do que posso fazer aqui.\n\nPara perguntas específicas, contate nossa equipe no *{phone}*.\n\nAqui está o que posso *fazer* por você:',

    finance_referral: '💰 Perguntas sobre *tarifas, descontos ou pagamentos* são tratadas pela nossa gerência — não pelo bot.\n\nContate-os diretamente:\n📱 *{phone}*\n\nDigite *menu* para voltar ao menu principal.',

    // Feedback
    menu_feedback:             '💬 Reclamações & Sugestões',
    menu_privacy:              '🔒 Privacidade & Política',
    menu_house_call:           '🏠 Visita Domiciliar',
    feedback_header:           '💬 *Reclamações & Sugestões*\n\nO que gostaria de fazer?',
    feedback_option_complaint: '1️⃣ Fazer uma Reclamação',
    feedback_option_suggestion:'2️⃣ Compartilhar uma Sugestão',
    feedback_complaint_msg:    '📞 *Reclamações*\n\nPara reclamações, entre em contato diretamente:\n📱 *{phone}*\n\nLevamos todas as reclamações a sério e entraremos em contato o mais breve possível.\n\n🏠 Digite *menu* para voltar.',
    feedback_suggestion_prompt:'💡 *Compartilhe sua Sugestão*\n\nDigite sua sugestão abaixo e a enviaremos para a equipe:\n\n_Digite *0* para voltar_',
    feedback_suggestion_thanks: '✅ *Obrigado pela sua sugestão!*\n\nAgradecemos sua contribuição e vamos analisá-la. 💈\n\n🏠 Digite *menu* para voltar.',
    feedback_invalid:          'Por favor responda com *1* ou *2*, ou digite *0* para voltar.',

    yes_words:  ['sim','s','yes','y'],
    no_words:   ['não','nao','no','n'],
    back_words: ['0','voltar','back','b'],
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

// Group bookings are capped at the `max_group_size` setting (see maxGroupSize()
// in conversationHandler.js); this list covers up to 4th, with a numeric
// fallback below for anything beyond that.
const ORDINALS = {
  en: ['first', 'second', 'third', 'fourth'],
  nl: ['eerste', 'tweede', 'derde', 'vierde'],
  es: ['primera', 'segunda', 'tercera', 'cuarta'],
  fr: ['première', 'deuxième', 'troisième', 'quatrième'],
  pt: ['primeira', 'segunda', 'terceira', 'quarta'],
};

/** Ordinal word ("first", "eerste", ...) for person n (1-based) in the given language. */
function ordinal(lang, n) {
  return (ORDINALS[lang] || ORDINALS.en)[n - 1] || `${n}e`;
}

const LANG_MENU_PROMPT_DEFAULT = '🌐 *Kies uw taal:*';
const LANG_MENU_HINT_DEFAULT =
  '_Typ een cijfer of de taal (bv. *1* of *Nederlands*)_\n' +
  '_Reply with a number or the language (e.g. *2* or *English*)_';

/** The language-selection menu shown to every new user (prompt + hint lines are configurable via settings) */
function buildLanguageMenu() {
  const q = require('../db/queries');
  const prompt = q.getSetting('lang_menu_prompt') || LANG_MENU_PROMPT_DEFAULT;
  const hint   = q.getSetting('lang_menu_hint')   || LANG_MENU_HINT_DEFAULT;
  return [
    prompt,
    '',
    '1️⃣  🇸🇷 Nederlands',
    '2️⃣  🇬🇧 English',
    '3️⃣  🇪🇸 Español',
    '4️⃣  🇫🇷 Français',
    '5️⃣  🇧🇷 Português',
    '',
    hint,
  ].join('\n');
}

const LANG_MAP = { '1': 'nl', '2': 'en', '3': 'es', '4': 'fr', '5': 'pt' };

// What customers actually type instead of a number: the language name (in any of
// the supported languages), the ISO language code, or the flag's country code.
const LANG_ALIASES = {
  nl: ['nederlands', 'dutch', 'hollands', 'nl', 'sr', 'su'],
  en: ['english', 'engels', 'ingles', 'anglais', 'en', 'eng', 'gb', 'uk', 'us'],
  es: ['espanol', 'spanish', 'spaans', 'espagnol', 'espanhol', 'es', 'esp'],
  fr: ['francais', 'french', 'frans', 'frances', 'fr', 'fra'],
  pt: ['portugues', 'portuguese', 'portugees', 'portugais', 'pt', 'br', 'bra'],
};

/**
 * Match user input to a supported language.
 * Accepts the menu number ('1'–'5'), the language name ("Nederlands", "español"),
 * or a country/ISO code ("sr", "gb", "es", "fr", "br", "nl", "en", …).
 * Accent-insensitive, so "espanol" matches "Español". Returns null if no match.
 */
function matchLanguage(text) {
  const raw = (text || '').trim().toLowerCase();
  if (LANG_MAP[raw]) return LANG_MAP[raw];
  const norm = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [lang, aliases] of Object.entries(LANG_ALIASES)) {
    if (aliases.includes(norm)) return lang;
  }
  return null;
}

const SUPPORTED = Object.keys(TRANSLATIONS);

module.exports = { t, ordinal, buildLanguageMenu, matchLanguage, LANG_MAP, SUPPORTED, TRANSLATIONS };
