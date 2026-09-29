// Supplement-store classification rules: which export rows are sold and where they go.
// Ported 1:1 from the research prototype classify_proto.py (the rule data below was converted from its source
// mechanically, then tuned by hand during the catalogue audit). Used by scripts/import-catalog.ts only.
//
// Conventions (same as src/lib/taxonomy.ts in /web):
//   kw(...)   keywords that must START a word; a trailing "$" on a keyword = it must END a word too
//   Rule      [subcategory slug, regex, guard?] — ordered lists, the first hit wins; a matching guard vetoes the rule
import { kw, ure } from "../../src/lib/text-match";

export type Rule = [sub: string, rx: RegExp, guard?: RegExp];
export type PriceProfile = { min: number; max: number; default: number; perKg?: number; perL?: number; perUnit?: number };

export const SUPP_SOURCES = new Set<string>([
  "Health & Supplements", "Pack - Health & Supplements", "Dietary Supplement", "Dietary Supplements",
  "Аптека и хранителни добавки", "Pack - Аптека и хранителни добавки", "Хранителни добавки", "Хранителна добавка",
  "Sports Nutrition", "Vitamins & Supplements", "Vitamins and Supplements", "Herbal Supplement", "Herbal Supplements",
  "Health Supplement", "Health Supplements", "Mineral Supplements", "Children's Health Supplement", "Pre-Workout Supplement",
  "Food Supplement", "Suplement diety", "Суplement diety", "Pack - Energy Drinks & Supplements", "Pack - Supplements",
  "Supplements", "supplements", "dietary supplement", "Dietary Supplement Syrup", "Vitamin D Supplement",
  "Plant-Based Protein Powder", "Suplementи за имунната система", "Suplementи за електролити", "Protein Mug Cake",
  "Multivitamin Gummies", "Herbal Extract", "Herbal Tincture", "Bone Health Supplement", "Probiotic Supplement",
  "Vitamin supplement", "Liquid Dietary Supplement", "Multivitamin Supplement", "Liquid Iron Supplement", "Hair Growth Supplement",
  "Hair Care Supplement", "Digestive Health Supplement", "Диетични добавки", "Digestive Health Supplements", "Multivitamins",
  "ДОБАВКИ КЪМ ХРАНАТА", "Digestive Enzyme Supplement", "Vitamin C Supplement", "Vitamin B12 Supplement",
  "Биологично активни добавки", "Vitamin Supplement", "Храна и хранителни добавки", "Health & Wellness",
  "Pack - Hygiene & Supplements", "Medical Food",
]);

export const FOOD_SOURCES = new Set<string>([
  "Food & Beverages", "Pack - Food & Beverages", "Syrup", "Syrups", "Fruit Syrup", "Herbal Tea", "Herbal Syrup", "Tea",
  "Fruit Tea", "Organic Food", "Organic Syrup", "snack", "snacks", "Snacks", "Health Foods", "Beverages",
  "Non-Alcoholic Beverages", "Pack - Energy Drinks & Sports Drinks", "Energy Drink", "Instant Beverage", "Herbal Juice",
  "Aloe Vera Juice", "Organic Apple Cider Vinegar", "Organic Coconut Oil", "Organic Coconut Blossom Sugar", "Flavored Syrup",
  "Organic Raspberry Syrup", "Organic Mint Syrup", "Organic Cranberry Syrup", "Herbal Beverage", "Food", "food", "Fruit Jam",
  "Organic Beetroot Juice", "Fermented Vegetable Juice", "Coffee", "Instant Coffee",
]);

export const SPORT_SOURCES = new Set<string>([
  "Sports & Fitness", "Pack - Sports & Fitness", "Sport & Fitness", "Sports Equipment", "Sports Accessories", "Fitness Equipment",
  "Sports Bag", "Sports & Outdoors", "Drinkware", "Water Bottle",
]);

export const LOOSE_SOURCES = new Set<string>(["", "Other"]);

export const ADULT = kw(
  "секс$", "секс-", "секси", "sex$", "sexy", "дилдо", "dildo", "вибратор", "vibrator", "пенис", "penis", "лубрикант", "lubricant",
  "lube$", "bdsm", "бдсм", "еротич", "erotic", "мастурб", "masturb", "клитор", "clitor", "анал(?:ен|на|ни|но)$", "anal$", "оргазм",
  "orgasm", "презерватив", "condom", "love doll", "стриптийз", "страп-?он", "strap-?on", "фалос", "phallus", "възбуждащ",
  "stimulating gel", "интимен гел", "бондаж", "bondage", "белезници", "fetish", "фетиш", "delay spray", "задържащ спрей", "ерекци",
  "erection", "вагина$", "vagina$", "бира$", "бири$", "уиски", "whisky", "whiskey", "водка", "vodka", "ракия", "ликьор",
  "шампанско", "коняк", "цигар", "вейп", "vape", "никотин", "тютюн", "наргиле", "cbd$", "канабидиол", "cannabidiol", "thc$",
  "марихуан",
  "harness", "bijoux indiscrets",
  "cannabis", "канабис",
);

export const ADULT_IMAGE_HOSTS = ure("sexwellshop\\.|sexshop|eroti[ck]", "iu");

export const ADULT_BRAND_ALLOW = new Set<string>(["ostrovit", "natureofagiva", "bulgarianteacompany", "bemapharm", "montavit"]);

export const ELECTRONICS = kw(
  "usb", "hdmi", "displayport", "ssd$", "hdd$", "nvme", "\\d+\\s?gb$", "\\d+\\s?tb$", "ddr\\d", "geforce", "radeon", "rtx\\s?\\d",
  "gtx\\s?\\d", "ryzen", "intel core", "процесор", "видеокарта", "дънна платка", "motherboard", "монитор", "monitor$", "клавиатур",
  "keyboard", "мишка$", "mouse$", "геймърск", "gaming", "headset", "слушалк", "headphone", "earbud", "earphone", "спийкър",
  "speaker", "тонколон", "зарядн", "charger", "кабел", "cable$", "адаптер", "adapter", "adaptor", "power ?bank", "лампа", "lamp$",
  "крушка", "bulb$", "led$", "прожектор", "projector", "скенер", "scanner", "принтер", "printer", "тонер", "toner", "мастил",
  "cartridge", "рутер", "router", "wi-?fi", "bluetooth", "блутут", "смартфон", "smartphone", "iphone", "ipad", "macbook",
  "samsung", "galaxy", "xiaomi", "huawei", "калъф", "кейс за", "case for", "phone case", "протектор за (?:екран|дисплей)",
  "screen protector", "стъклен протектор", "закален[оа]? стъкло", "tempered glass", "уеб ?камера", "webcam", "камера$", "camera$",
  "лаптоп", "laptop", "notebook$", "таблет$", "телевизор", "tv$", "стойка за (?:телевизор|монитор|телефон|таблет)", "флаш памет",
  "pendrive", "memory card", "карта памет", "micro ?sd", "дифузер", "diffuser", "овлажнител", "humidifier", "пречиствател",
  "air purifier", "прахосмукачк", "смарт часовник", "smartwatch", "смарт гривна", "фитнес гривна", "fitness tracker", "везна$",
  "кантар", "електрическа четка", "ел. четка", "зъбен душ", "накрайници", "трипод", "tripod", "селфи", "selfie", "дрон", "конзола",
  "playstation", "xbox", "nintendo", "джойстик", "gamepad", "ups$", "logitech", "asus", "msi$", "benq", "aoc$", "lanberg",
  "verbatim", "adata", "kingston", "sandisk", "platinet", "trust gxt", "canon", "brother", "epson", "lenovo", "acer$", "dell$",
  "anker", "orico", "ugreen", "baseus", "tp-link", "d-link", "neomounts", "newstar", "tefal", "bosch", "philips", "rowenta",
  "delonghi", "de'?longhi", "jbl$", "gigabyte", "asrock", "corsair", "razer", "steelseries", "hyperx", "natec", "esperanza",
  "cisco", "iriscan", "krusell", "4smarts", "tech-protect", "zagg", "spigen", "trisa", "oral-?b", "beurer", "omron", "microlife",
  "xavax", "haylou", "insta360", "amazfit", "fitbit", "garmin", "satechi", "casio", "quad lock", "sony$", "hama$", "maclocks",
  "hoco$", "remax$", "energizer", "duracell", "varta",
  "безжичен", "безжична", "контролер", "remote$", "augmented reality", "gun blaster",
);

export const ELECTRONICS_IMAGE_HOSTS = ure("polycomp\\.bg|cdn\\.dice\\.bg", "iu");

export const DRUG_NAMES = kw(
  "парацетамол", "парацетамакс", "панадол", "аналгин", "упса$", "упсарин", "ибупром", "ибупрофен", "нурофен", "налгезин",
  "проалгин", "дексофен", "кетонал", "аспирин", "ацетилин", "кардиомагнил", "спазмалгон", "но-?шпа", "бускопан", "дротаверин",
  "колдрекс", "фервекс", "терафлу", "тера-?флу", "мукосолван", "амброксол", "бромхексин", "ацц$", "флуимуцил", "ердомед",
  "проспан", "синупрет", "тонзилгон", "тонзилотрен", "инфлуцид", "оцилококцинум", "стодал", "коризалия", "хомеовокс", "стрепсилс",
  "тантум", "септолете", "фарингосепт", "хексорал", "хексализ", "лизобакт", "имудон", "пробитор", "сопрал", "нолпаза", "панразол",
  "пулсет", "хелицид", "ранитидин", "фамотидин", "квамател", "ренни", "гевискон", "маалокс", "алмагел", "еспумизан", "смекта",
  "ентерол", "хидрасек", "имодиум", "лоперамид", "мезим", "креон", "панкреатин", "карсил", "есенциале", "хептрал", "урсофалк",
  "лорано", "кларитин", "лоратадин", "цетиризин", "зиртек", "алерзин", "ериус", "телфаст", "фенистил", "отривин", "називин",
  "снуп$", "виброцил", "ксилометазолин", "оксиметазолин", "африн", "санорин", "нафазолин", "волтарен", "фастум", "фелоран",
  "диклофенак", "кетопрофен", "долобене", "хепатромбин", "лиотон", "троксевазин", "милгамма", "магне b6", "бепантен", "валидол",
  "корвалол", "ремотив", "новопасит", "персен", "детралекс", "флебодия", "венорутон", "ескузан", "постеризан", "проктогливенол",
  "ентерофурил", "ерцефурил", "фурадонин", "уролесан", "фитолизин", "канефрон", "сераза", "цитрамон", "темпалгин", "тетралгин",
  "седалгин", "беналгин", "аналгин", "мелоксикам", "нимезулид", "нимесил", "ацикловир", "зовиракс", "клотримазол", "канестен",
  "флуконазол", "тербинафин", "ламизил", "хидрокортизон", "лидокаин", "бензидамин", "хлорхексидин", "метамизол", "натриев цитрат",
  "малтофер", "тардиферон", "сорбифер", "фероградумет", "тотема", "урго", "вентолин", "салбутамол", "беродуал", "пулмикорт",
  "фликсотид", "серетид", "симбикорт", "релвар", "бретарис", "екозал", "силденафил", "тадалафил", "виагра", "сиалис", "левитра",
  "еротон", "ибупрофен", "апоферин", "ibuprofen", "paracetamol", "aspirin", "nurofen", "coldrex", "strepsils", "voltaren",
  "loratadin", "cetirizin",
  // audit additions
  "орофар", "цинкорот", "магнерот", "гликлазид", "лапозан", "безалерия", "екзилор", "фертин", "онглайза", "валзера", "валдоцеф", "алендронат", "лиспецип", "ватуд", "алвоцитал", "никоб", "темодал", "микосист", "геломиртол", "грипомед", "снип колд", "controloc", "контролок", "омепразид", "prazolid", "roletra", "ролетра", "димекс", "алора", "бронхостоп", "циклодинон", "протефикс", "афтамед", "отомер", "стеримар", "sterimar",
);

export const DRUG_FORMS = kw(
  "инх\\.", "инх$", "инхал", "inhaler", "инж\\.", "инж$", "инжекц", "injection", "инфуз", "infusion", "р-р$",
  "разтвор за (?:инжек|инфуз|очи|нос|уши)", "перорална суспензия", "суспензия$", "супозитори", "suppositor", "свещичк",
  "вагинални (?:таблет|капсул|глобул|супоз)", "ректал", "маз$", "мехлем", "унгвент", "капки за (?:очи|уши|нос)", "очни капки",
  "eye drops", "ушни капки", "назален", "nasal", "спрей за нос", "шприц", "спринцовк", "филмирани", "стомашно-?устойчиви",
  "удължено освобождаване", "ретард$", "сироп (?:при|за|против) (?:суха |влажна )?кашлица", "при суха кашлица",
  "при влажна кашлица",
  "таблетки при (?:болка|температура|киселини|алерги|диария|гадене|хрема|грип|настинка|зъбобол|главоболие|кашлица|спазми)",
  "при (?:висока )?температура и болк", "при болка и температура", "при алергии", "при киселини", "при рефлукс", "при диария",
  "при хемороиди", "при гъбични", "при херпес",
  // audit additions
  "писалка", "облекчаване (?:на )?симптом(?:ите|и)? (?:на|при) (?:грип|настинк|алерги)", "при стомашни киселини", "твърди капсули", "на носа", "за носа", "за уши", "спрей за уши",
  "овлажняване на очите", "артелак",
  // review round 1: throat lozenges filed under "energy" (brand Swiss Energy)
  "при болки в гърлото", "при болка в гърлото", "пастили при", "пастили за гърло", "за смучене при",
);

export const DRUG_DOSE = ure("\\d+/\\d+/\\d+\\s?(?:мг|mg)(?![\\p{L}])|\\d(?:[.,]\\d+)?\\s?(?:мг|mg|мкг|mcg|µg|ед|mmol)\\s?/\\s?\\d*(?:[.,]\\d+)?\\s?(?:мл|ml|доза|dose|впр)|\\d(?:[.,]\\d+)?\\s?(?:мг|mg)\\s?/\\s?\\d+(?:[.,]\\d+)?\\s?(?:мг|mg|мкг|mcg)", "iu");

export const PHARMA_COMPANIES = kw(
  "teva$", "тева$", "zentiva", "зентива", "krka$", "крка$", "stada$", "щада$", "sandoz", "сандоз", "novartis", "pfizer",
  "astrazeneca", "roche$", "medochemie", "gedeon richter", "servier", "sanofi", "egis$", "berlin[- ]?chemie", "actavis",
  "alkaloid", "polpharma", "adamed", "чайкафарма", "tchaikapharma", "chaikapharma", "софарма", "sopharma", "nobel pharma",
  "unimed pharma", "neobalkanika", "us pharmacia", "hexal", "ratiopharm", "worwag", "wörwag", "mylan", "viatris", "glaxo",
  "haleon", "boehringer", "lundbeck", "organon", "abbvie", "galen pharma", "ecopharm", "leo pharma", "antibiotic razgrad",
  "антибиотик-разград", "gsk$",
  // audit additions
  "takeda", "alvogen", "schering", "medochemie", "gedeon", "рихтер",
);

export const DRUG_TOKEN_STOP = new Set<string>([
  "витамин", "тинктура", "кости", "омега", "течен", "натриев", "калиев", "калциев", "алфа", "мелатонин", "серум", "вазелин",
  "трио", "ментол", "остео", "прополисов", "лавандулов", "етилов", "магнезиев", "фолиева", "железен", "цинков", "хранителна",
  "билков", "масло", "крем", "сироп", "капки", "гел", "спрей", "прах", "таблетки",
]);

/** INN (generic drug name) endings: омепразол, валсартан, амлодипин, бисопролол, метформин … */
export const INN = kw(
  "\\p{L}+(?:празол|prazole?|сартан|sartan|дипин|dipine?|олол|olol|флоксацин|floxacin|цилин|cillin|зепам|zepam|золам|zolam|глиптин|gliptin|клазид|clazide?|дронат|dronate?|оксетин|oxetine?|алопрам|alopram|тиазид|thiazide?|коназол|conazole?|тримазол|trimazole?|вастатин|vastatin|сетрон|setron|триптан|triptan|лукаст|lukast|рацетам|racetam)$",
);

/** A pharmacy-feed medicine: TRADE NAME + form + dose ("ЛАПОЗАН табл 10мг х 30бр", "ТЕМОДАЛ твърди капсули 100мг"). Case-sensitive. */
export const PHARMACY_FORMAT = ure(
  "^[А-ЯЁ][А-ЯЁ0-9\\-]{2,}[^,]*?(?:табл|тб|тбл|капс|филм[- ]?табл|твърди капсули)\\.?\\s*\\d+(?:[.,]\\d+)?\\s?мг",
  "u",
);

export const HOMEOPATHY = kw(
  "хомеопат", "homeopat", "homöopath", "boiron", "боарон", "heel$", "dhu$", "dhu-arzneimittel", "шуслер", "schüssler",
  "schuessler", "schussler", "минерална сол", "\\d+\\s?ch$", "\\d+\\s?dh$", "[dд]\\s?(?:4|5|6|8|10|12|15|30|60|200)$", "траумел",
  "traumeel", "енгистол", "лимфомиозот", "цел-т", "дискус композитум", "гриппхеел", "седатиф", "sedatif", "similasan",
  "oscillococcinum", "ацидум", "acidum",
  "ch\\s?\\d+$", "coffea cruda",
);

export const FLOWER_ESSENCES = kw(
  "цветн(?:а|и) есенци", "есенция", "angel es+ence", "phi essences", "метода на бах", "метода на д-р бах", "бах №", "bach flower",
  "rescue remedy", "флорални еликсири",
  "д-р бах", "dr\\.? bach", "капките на",
);

export const ESSENTIAL_OIL = kw("етерично масло", "етерични масла", "essential oil", "ароматерап", "аромотерап", "aromatherap", "масло за дифузер", "арома масло", "арома композиц", "aroma composition");

export const ORAL_FORM = kw("капсул", "caps$", "capsules", "softgel", "софтгел", "перли", "дражета", "таблет", "tabs$", "tablets");

export const MEDICAL = kw(
  "ортез", "бандаж", "наколенк", "налакътник", "шина$", "шини$", "корсет", "стелк", "пластир", "plaster$", "превръзк", "бинт$",
  "бинтове", "марля", "марлен", "компрес(?!ор)", "термометър", "thermometer", "кръвно налягане", "апарат за (?:кръвно|измерване)",
  "глюкомер", "ланцет", "тест ленти", "тест-ленти", "тест за (?:бременност|овулация|covid|антиген)", "инхалатор", "небулизатор",
  "аспиратор", "компресивн", "памперс", "пелени", "урологичн", "подложки (?:за|при) (?:легло|инконтиненция|жени|мъже|кърмачки)",
  "инконтиненц", "дамски превръзки", "тампони", "менструална чашка", "еднократни ръкавици", "нитрилни", "медицинска маска",
  "спринцовк", "катетър", "контактни лещи", "разтвор за лещи", "слухов апарат", "шийна яка", "патерица", "бастун", "проходилка",
  "инвалидна", "грейка", "термофор", "морска вода (?:спрей|за нос)", "физиологичен разтвор", "коремна стена", "бандажна",
  "медна гривна", "магнитна гривна", "orthoteh", "ортотех", "anatomicline", "hartmann", "molicare", "моликеър", "seni$", "urgo$",
  "hansaplast", "scholl", "medtextile", "bionime", "tena$", "sterimed", "pharmadoct", "neoplast", "matopat", "medica$",
  "dr\\.? frei (?:компресорен|инхалатор)", "капки за очи", "лубрикиращи", "овлажняващи капки", "лепенк", "kinesio", "кинезио",
  "тейп", "tape$", "корега", "corega", "зъбни протези", "протеза",
  // audit additions
  "хирург", "еднократн", "предпазна маска", "маска предпазна", "copper bracelet", "magnetic bracelet", "против прилошаване",
  // review round 1: food for special medical purposes (clinical sip feeds)
  "fresubin", "фрезубин", "nutridrink", "нутридринк", "ensure plus", "енсуър", "diasip", "cubitan",
);

export const PETS = kw(
  "за кучета", "за куче", "за котки", "за котка", "кучешк", "котешк", "dog$", "dogs$", "puppy", "kitten", "for cats", "for dogs",
  "нашийник", "каишка", "повод за", "домашни любимци", "домашен любимец", "pet$", "pets$", "ветеринар", "за птици", "за папагали",
  "за рибки", "за гризачи", "за зайци", "котешка тоалетна",
);

export const CLOTHING = kw(
  "тениска", "тениски", "t-?shirt", "потник", "tank ?top", "клин$", "клинове", "leggings", "шорти", "shorts$", "суитшърт",
  "sweatshirt", "hoodie", "худи", "суичър", "горнище", "долнище", "анцуг", "tracksuit", "панталон", "pants$", "joggers?$",
  "джогър", "яке$", "jacket", "шапка", "beanie", "snapback", "baseball cap", "чорапи", "socks$", "бельо$", "сутиен", "bra$",
  "бикини", "рокля", "облекло", "apparel", "оформящ", "shapewear", "стягащ", "маратонки", "обувки", "shoes$", "джапанки", "чехли",
  "раница", "backpack", "сак$", "кърпа$", "towel$", "хавлия", "блуза", "риза$", "crop top", "спортен сутиен", "бюстие",
  "гащеризон", "клин за", "ластичен клин", "унисекс", "unisex", "размер (?:xs|s|m|l|xl|xxl)$",
);

export const COSMETICS = kw(
  "крем за", "крем-", "дневен крем", "нощен крем", "cc крем", "bb крем", "face cream", "hand cream", "body cream", "foot cream",
  "eye cream", "day cream", "night cream", "серум", "serum$", "шампоан", "shampoo", "балсам за", "conditioner", "душ[- ]?гел",
  "shower gel", "body wash", "сапун", "soap$", "лосион", "lotion", "тоник за", "мицеларн", "micellar",
  "маска за (?:лице|коса|очи|устни|ръце|крака)", "face mask", "sheet mask", "hair mask", "паста за зъби", "toothpaste",
  "четка за зъби", "вода за уста", "mouthwash", "дезодорант", "deodorant", "рол-?он", "roll-?on", "антиперспирант", "парфюм",
  "perfume", "тоалетна вода", "eau de", "edp$", "edt$", "червило", "lipstick", "гланц за устни", "балсам за устни", "lip balm",
  "спирала", "mascara", "фон дьо тен", "пудра", "руж$", "сенки за очи", "лак за нокти", "nail polish", "лакочистител",
  "слънцезащит", "spf\\s?\\d", "sunscreen", "sunblock", "автобронзант", "скраб", "scrub$", "пилинг", "peeling", "ексфолиант",
  "exfoliat", "боя за коса", "къна$", "henna", "олио за",
  "масло за (?:тяло|коса|масаж|брада|кожа|лице|бебе|кутикули|нокти|ръце|крака|устни)", "масажно масло", "massage oil", "body oil",
  "hair oil", "бадемово масло за",
  "гел за (?:лице|тяло|душ|интимна|ръце|крака|коса|очи|бръснене|вежди|масаж|стави|мускули|вени|рани|белези|зъби|венци|почистване)",
  "интимна хигиена", "интимен", "мокри кърпи", "ароматизатор", "ароматн[аи] свещ", "свещ$", "свещи$", "incense", "тамян",
  "соли за вана", "сол за вана", "bath salt", "bath bomb", "бомбичк", "пяна за", "за бръснене", "самобръсначк", "депилац",
  "восъчни ленти", "грим$", "makeup", "очна линия", "молив за (?:очи|устни|вежди)", "пачове", "patches$", "ампул(?:а|и) за лице",
  "за лице", "лифтинг", "против бръчки", "anti-?wrinkle", "хидратиращ", "подхранващ", "озаряващ", "изсветляващ", "почистващ",
  "шампоан", "лак за коса", "спрей за коса", "hair spray", "стилизиращ", "кутикул", "нокторезачка", "пила за нокти", "пинсета",
  "четка за коса", "гребен", "огледал", "козметичн", "cosmetic", "за тяло", "body lotion", "бебешко масло", "масло за бебе",
  "олио", "ролер за лице", "гуа ша", "gua sha", "крем против", "крем с ", "крем при", "маска$", "рол он", "за ръце", "за крака",
  "за пети", "против пърхот", "пърхот", "косопад(?! при)", "гел-крем", "крем-гел", "спрей за тяло", "спрей против", "антиакари",
  "акари", "репелент", "против комари", "комари", "кърлежи", "дезинфек", "антибактериален гел", "гел за ръце", "перилн",
  "почистващ препарат", "препарат за", "балсам$", "мехлем", "vaseline", "вазелин",
);

export const COSMETIC_VOLUME = ure("(?<![^\\W_])(?:крем|cream|гел|gel|балсам|масло|oil)(?![^\\W_]).{0,40}?\\d+\\s?(?:мл|ml)(?![^\\W_])", "iu");

/** Cosmetics even when a "safe" word (vitamin, oil …) is in the name: body oils, shampoos, masks, oral care … */
export const COSMETICS_STRONG = kw(
  "шампоан", "shampoo", "балсам за (?:коса|устни|съдове)", "conditioner", "олио за", "олио$", "body oil", "маска за", "sheet mask",
  "шийт маска", "серум", "serum$", "лосион", "lotion", "слънцезащит", "spf\\s?\\d", "sunscreen", "почистваща пяна", "пяна за",
  "мицеларна вода", "micellar water", "кърпи за", "мокри кърпи", "мист$", "mist$", "база за нокти", "лак за нокти",
  "nail polish", "cushion", "tirtir", "дезодорант", "deodorant", "парфюм", "тоалетна вода", "крем за (?:лице|ръце|тяло|крака|очи|коса)",
  "нощен крем", "дневен крем", "face cream", "hand cream", "body cream", "eye cream", "за чувствителна кожа", "бебешко олио", "за коса и тяло",
  "душ[- ]?гел", "сапун", "(?<!спрей-)гел за уста", "за почистване на (?:уста|зъби|зъбите)", "почистване на зъбите", "паста за зъби", "вода за уста",
  "anti[- ]?cellulite (?:booster )?gel", "cellulite gel", "dmso", "фиби", "шнола", "ластици за коса", "тебешири за коса",
  "illuminating gel", "озаряващ гел", "ролер за лице", "face roller", "концентрат(?:и)? за коса", "боя за коса", "билкова боя",
  "lips$", "липс$", "lip balm", "скрънчи", "скунчи", "панделка", "ластик за коса", "ластици",
  "лакочистител", "карите", "shea butter", "масло от шеа",
  "филър", "filler", "mask$",
  // review round 1: masks and make-up slipped through as "safe" (vitamins / protein in the name), sun care, K-beauty
  "маска$", "маски$", "лифтинг", "коректор", "concealer", "палитра", "palette$", "сенки$", "сенки за",
  "eyeshadow", "хайлайтър", "highlighter", "бронзант", "bronzer", "relief sun", "sun cream", "sun stick", "sun serum",
  "sun fluid", "sun milk", "after sun", "calming cream", "heartleaf", "axis-y", "beauty of joseon", "cosrx", "skin1004",
  "anua$", "round lab", "isntree", "some by mi", "purito", "missha", "klairs", "medicube", "torriden", "mixsoon", "numbuzin",
  "dr\\.? jart", "innisfree", "laneige", "clay balm", "cleansing balm", "cleansing foam", "измиваща", "почистващ гел", "a-derma", "емолиент", "emollient",
  "пантенол", "panthenol",
);

export const COSMETIC_SAFE = kw(
  "протеинов", "protein", "шоколад", "лешник", "фъстъч", "peanut", "енергиен гел", "energy gel", "gel pre-?workout",
  "isotonic gel", "carbo gel", "за пиене", "гел за пиене", "алое вера гел", "aloe vera gel", "mct", "омега", "omega", "рибено",
  "fish", "krill", "крил", "cod liver", "треска", "ленено", "flax", "черен кимион", "black seed", "cumin", "кокосово масло",
  "coconut oil", "carnitine", "карнитин", "течен", "liquid", "shot$", "ампули за пиене", "сироп", "syrup", "витамин", "vitamin",
  "капки за пиене", "перорал", "sauce", "сос", "salted caramel", "cookies (?:&|and|n) cream", "ice cream", "сладолед",
  "ягодов крем", "strawberry cream", "banana cream", "cream cheese", "крем брюле", "creme brulee", "cheesecake",
);

/** Household chemicals (dishwasher / laundry / cleaning). */
export const HOUSEHOLD = kw(
  "съдомиял", "dishwasher", "за съдове", "прах за пране", "перилн", "за пране", "омекотител", "против варовик", "за тоалетна",
  "wc$", "препарат за", "течен препарат", "препарат течен", "calgon", "finish$", "domestos", "ariel", "persil", "lenor",
  "somat$", "cillit", "bref$", "vanish", "почистващ препарат",
  "пране$", "петна", "обезмаслител", "отстранител на миризми",
);

/** Non-food goods that end up in supplement categories (car care, textiles, pillows …). */
export const MISC_NONFOOD = kw(
  "двигателно масло", "моторно масло", "motor oil", "engine oil", "shell helix", "антифриз", "възглавни", "одеяло", "калъфка",
  "eaton", "rack2u", "гривна", "bracelet", "празна (?:стъклена )?бутилка", "капкомер",
  "смирна", "бензоин", "стиракс", "понтификал", "за кадене", "ароматна смола",
  "чаршаф", "матрак", "папка", "домакински ръкавици", "работни ръкавици", "винилови ръкавици",
);

/**
 * Laxatives (review round 1): lactulose / bisacodyl / picosulfate / macrogol medicines, laxative syrups, teas and
 * herbal laxatives. Fibre supplements (psyllium husk) stay unless they also carry a laxative herb or drug.
 */
export const LAXATIVE = kw(
  "лактулоз", "lactulos", "дуфалак", "duphalac", "бизакодил", "bisacodyl", "дулколакс", "dulcolax", "бизалакс", "bisalax",
  "фенолакс", "fenolax", "елакса", "elaxa", "пикосулф", "picosulf", "макрогол", "macrogol", "форлакс", "forlax", "лаксатив",
  "laxativ", "laxative", "слабител", "при запек", "срещу запек", "против запек", "запек -", "запек и", "при констипац", "лаксит",
  "лакс-ес", "лаксилин", "лаксена", "радирекс", "rumelax", "physiolax", "физиолакс", "stipfit", "стипфит", "фрутилакс", "frutilax",
  "вая лакс", "isilax", "исилакс", "xolon", "ксолон",
);
/** Laxative ingredients that make a fibre product a laxative after all. */
export const LAXATIVE_STRONG = kw("сена", "senna", "лактулоз", "lactulos", "бизакод", "bisacod", "пикосулф", "макрогол", "зърнастец", "buckthorn", "cascara", "каскара", "алое ферокс");
/** Fibre supplements (food): psyllium husk, glucomannan, inulin. */
export const FIBRE = kw("псилиум", "psyllium", "хуск", "husk", "фибри", "fiber", "fibre", "глюкоманан", "glucomannan", "инулин", "inulin");

/**
 * For the skin, not to eat or drink (review round 1): pain / massage gels, hormone and vitamin creams, topical sprays,
 * wound and insect-bite gels, air sprays.
 */
export const TOPICAL = kw(
  "гел при", "гел след", "масажен гел", "massage gel", "massage oil", "долор", "dolor", "арникамед", "arnikamed",
  "arnica cream", "calendula cream", "arthritis cream", "muscle cream", "joint (?:&|and) muscle cream", "pre-workout cream",
  "warm-?up cream", "progesterone cream", "estriol", "естриол", "breast cream", "cream with lavender", "d-?3 cream",
  "yam cream", "антибактериален крем", "burner booster gel", "slimming gel", "topical", "transdermal", "трансдермал",
  "oil spray", "magnesium oil", "магнезиево олио", "за външно", "external use", "стратамед", "stratamed", "ухапване",
  "insect bite", "пречистване на въздух", "air purif", "гел 9\\d\\s?%", "gel 9\\d\\s?%", "за измиване на",
  "всякакви повърхности",
);

/** Stationery and office goods filed under supplements (a pencil sharpener shaped like a shaker). */
export const STATIONERY = kw(
  "острилк", "sharpener", "maped$", "химикалк", "тетрадк", "гума за триене", "флумастер", "маркер$", "канцелар", "пергел",
  "молив$", "моливи$", "пастели", "акварел", "стикери$", "стикер$", "подложка за писане", "класьор",
);

/** Plant milks and juice shots (groceries, filed under breakfast / energy): review round 1. */
export const PLANT_DRINK = kw(
  "овесена напитка", "оризова напитка", "бадемова напитка", "соева напитка", "кокосова напитка", "растителна напитка",
  "oat drink", "almond drink", "rice drink", "soy drink", "coconut drink", "plant milk", "шот джинджифил", "шот джинжифил",
  "ginger shot", "имунен шот", "immune shot", "сафед мюсли", "safed musli", "черно мюсли",
);

export const JUNK_FOOD = kw(
  "чипс", "chips", "crisps", "бонбон", "близалк", "локум", "дъвк(?:а|и)$", "дъвчаща гума", "желирани бонбони", "мармалад",
  "шоколад", "chocolate$", "бисквит", "biscuit", "вафл", "wafer", "кроасан", "кекс", "торта", "кейк", "спагети", "фусили", "пене$",
  "макарони", "нудъли", "noodles", "pasta$", "паста$", "брашно", "flour$", "ориз$", "оризов$", "rice$", "леща", "боб$", "нахут",
  "зеленчу", "замразен", "конерв", "консерв", "бульон", "супа$", "сос$", "sauce$", "кетчуп", "майонеза", "горчица", "подправк",
  "подправка", "захар$", "sugar$", "кафе$", "coffee$", "сок$", "juice$", "нектар", "лимонада", "газирана", "минерална вода",
  "изворна вода", "вода$", "water$", "енергийна напитка", "мляко$", "milk$", "йогурт", "кисело мляко", "сирене", "cheese$",
  "масло$", "butter$", "маргарин", "олио", "зехтин", "olive oil", "оцет$", "vinegar$", "хляб", "bread$", "кроутони", "грисини",
  "снакс", "snack$", "пуканки", "popcorn", "пюре", "бебешк", "за бебета", "\\d+\\s?м\\+", "каша$", "адаптирано",
  "семена за засаждане", "за засаждане", "за покълване", "разсад", "нори", "суши", "тофу", "темпе", "сейтан", "колбас", "шунка",
  "месо", "пилешк", "риба$", "тон$", "сардин", "маслини", "туршия", "кисело зеле", "мариновани", "паста от", "чай$", "tea$",
  "студен чай", "iced tea", "ice tea", "earl grey", "english breakfast", "черен чай", "black tea", "chai latte", "какао$",
  "cocoa$", "сладко$", "мед$", "honey$", "желе$", "jelly$", "конфитюр", "jam$", "крем$", "сладкиш", "пай$", "пудинг", "десерт",
  "сладолед$", "ice cream$", "джелато", "снакс", "крекер", "cracker", "солети", "пръчици", "бадеми в", "в шоколад", "захаросан",
  "драже", "драже$", "пралини", "трюфел", "бонбониера", "коледн", "великденск", "яйце$", "яйца$", "шоко", "choco$", "nutella",
  "kinder", "m&m", "snickers$", "mars$", "twix", "bounty", "milka", "lindt", "ferrero", "haribo", "mentos", "pringles", "lay's",
  "chio", "doritos", "coca-?cola", "pepsi", "fanta", "sprite", "red bull", "monster energy", "nescafe", "jacobs", "lavazza",
  "tchibo", "heinz", "knorr", "maggi", "barilla",
  "спред$", "пастет",
  "песто", "pesto",
);

export const HEALTHY_OVERRIDE = kw(
  "протеин", "protein", "whey", "кето", "keto$", "без захар", "без добавена захар", "sugar[- ]?free", "no sugar", "no added sugar",
  "zero$", "0 ?kcal", "0 калории", "нискокалоричн", "нискокалоричен", "low ?carb", "high ?protein", "hi ?protein", "fit$", "фит$", "skinny",
  "диетичн", "diet$", "конджак", "konjac", "shirataki", "ширатаки", "stevia", "стевия", "еритритол", "erythritol", "ксилитол",
  "xylitol", "манука", "manuka", "колаген", "collagen", "пробиоти", "probiotic", "mct$", "ябълков оцет", "apple cider vinegar",
  "суперхран", "superfood", "спирулина", "хлорела", "чия", "chia", "киноа", "quinoa", "овес", "oat", "гранола", "мюсли", "muesli",
  "оризовк", "rice cakes", "оризови вафли", "оризови галет", "царевични вафли", "фъстъчено масло", "peanut butter",
  "бадемово масло", "тахан", "тахини", "nut butter", "ядково масло", "ядков крем", "алое вера", "aloe vera", "нони", "noni",
  "комбуча", "kombucha", "билков", "herbal", "функционал", "адаптоген", "витамин", "vitamin", "електролит", "electrolyt",
  "изотони", "isotonic", "bcaa", "креатин", "creatine", "gainer", "гейнър", "flapjack", "флапджак", "протела", "protella",
  "zero sauce", "fit sauce", "фит сос", "без глутен", "gluten[- ]?free", "веган протеин",
  // audit: supplement forms / sports products whose flavour or ingredient is a grocery word
  "pre-?workout", "предтренировъч", "карнитин", "carnitin", "cla$", "amino", "аминокиселин", "eaa$", "глутамин", "glutamin", "капс", "caps$", "capsules", "таблетк", "tablets", "tabs$", "softgel", "софтгел", "\\d+\\s?дози", "servings", "хранителна добавка", "food supplement", "dietary supplement", "омега", "omega", "черен кимион", "black seed", "ленено масло", "flaxseed oil",
);

export const ACCESSORY_RULES: Rule[] = [
  [
    "sheykari-i-butilki",
    kw(
      "шейкър", "shaker", "minishaker", "mini shaker", "smartshake", "шише за вода", "бутилка за вода", "спортна бутилка", "water bottle", "бутилка за (?:вода|напитки|спорт)", "бутилка спортна", "термо ?бутилка", "бутилка с (?:филтър|сламка|инфузер)",
      "jug$", "gallon", "кутия за (?:хапчета|таблетки|капсули)", "органайзер за (?:хапчета|таблетки|лекарства)", "pill ?box",
      "pill case", "фуния за", "protein funnel", "blender bottle", "mixer bottle", "shieldmixer", "контейнер за храна", "meal prep",
      "ice pack", "термо чаша", "thermo mug", "чаша за (?:шейк|протеин)",
    ),
  ],
  [
    "kolani-i-rakavitsi",
    kw(
      "ръкавици", "gloves", "колан$", "колани$", "belt$", "lever belt", "dip belt", "накитници", "wrist ?wraps", "фитили", "straps$",
      "lifting straps", "лифтинг ленти", "knee sleeves", "knee wraps", "лента за (?:коляно|лакът|китка|глезен)", "наколенки за (?:клякане|вдигане)", "лакътни бинтове", "chalk",
      "тебешир", "магнезий за ръце", "liquid chalk", "hooks$", "куки за", "боксови бинтове", "handwraps", "hand wraps",
    ),
  ],
  [
    "fitnes-uredi",
    kw(
      "ластик", "ластични ленти", "resistance band", "mini ?band", "фитнес лента", "power band", "loop band", "въже за скачане",
      "jump rope", "skipping rope", "фоам ролер", "foam ?roller", "фоумролер", "масажен ролер", "масажна топка", "massage ball", "massage gun",
      "масажен пистолет", "гира$", "гири$", "дъмбел", "dumbbell", "kettlebell", "пудовк", "диск(?:ове)? за (?:щанга|лост)",
      "постелка за (?:йога|фитнес|упражнения)", "yoga mat", "fitness mat", "йога", "fitball", "фитбол", "гимнастическа топка",
      "gym ball", "swiss ball", "ab wheel", "колело за коремни", "hand ?grip", "ръкохватк", "grip trainer", "push-?up", "лицеви опори",
      "trx$", "лост за набиране", "pull-?up bar", "balance board", "утежнител", "ankle weights", "боксови ръкавици", "boxing gloves",
      "боксова круша", "punching bag", "fitness equipment", "hip circle", "sliders$", "степ платформа", "аеробен степ", "лост$", "щанга", "тежести",
    ),
  ],
];

/**
 * Audit: generic accessory words ("ръкавици", "колан", "ластик" …) also name bedding, stationery folders, hair ties,
 * household and moto gloves. Belts / gloves / fitness gear are accepted only with one of these specific item words,
 * a fitness context word, or a sports-nutrition brand (SPORT_BRANDS).
 */
export const ACCESSORY_SPECIFIC = kw(
  "knee sleeves", "knee wraps", "wrist ?wraps", "lifting straps", "лифтинг ленти", "dip belt", "lever belt", "liquid chalk",
  "магнезий за ръце", "resistance band", "mini ?band", "power band", "loop band", "ластични ленти", "ластична лента", "фитнес лента",
  "foam ?roller", "фоумролер", "фоам ролер", "massage gun", "масажен пистолет", "масажен ролер", "масажна топка", "massage ball",
  "dumbbell", "дъмбел", "kettlebell", "пудовк", "yoga mat", "fitness mat", "постелка за (?:йога|фитнес|упражнения)", "fitball", "фитбол",
  "gym ball", "swiss ball", "ab wheel", "колело за коремни", "jump rope", "skipping rope", "въже за скачане", "pull-?up bar",
  "лост за набиране", "boxing gloves", "боксови ръкавици", "боксови бинтове", "hand ?wraps", "handwraps", "fitness equipment",
  "hip circle", "balance board", "ankle weights", "утежнител", "щанга", "диск(?:ове)? за (?:щанга|лост)", "blackroll", "trx$",
  "grip trainer", "hand ?grip", "лицеви опори", "push-?up", "гимнастическа топка", "степ платформа", "аеробен степ", "колан за кофички", "кожен колан", "тренировъчен колан",
);
export const FITNESS_CONTEXT = kw(
  "фитнес", "fitness", "gym$", "тренировъч", "тренировк", "training", "workout", "lifting", "вдигане", "powerlift", "кросфит", "crossfit",
  "бодибилд", "bodybuild", "бокс", "boxing", "йога", "yoga", "пилатес", "pilates", "упражнени", "exercise", "набиране", "кофички",
  "съпротив", "resistance", "спортн", "sport$", "sports$",
);
/** Sports-nutrition / fitness-gear brands, in the Brand column or the name. */
export const SPORT_BRANDS = kw(
  "gym ?beam", "harbinger", "mp sport", "power system", "mad ?max", "blackroll", "smart ?shake", "olimp", "scitec", "amix", "biotech",
  "trec", "allnutrition", "ostrovit", "myprotein", "kevin levrone", "armageddon", "6pak", "vplab", "hero\\.?lab", "sfd", "kfd",
  "applied nutrition", "nutrend", "extrifit", "everbuild", "dorian yates", "born winner", "gaspari", "optimum nutrition", "fitforce",
  "pure nutrition", "sveltus", "bladeshaker", "blender bottle", "bsn$",
);

export const ACCESSORY_GUARD = kw(
  "капсул", "таблет", "caps$", "tabs$", "дози", "servings", "протеин(?!ов шейкър)", "whey", "креатин", "creatine", "bcaa",
  "vitamin", "витамин", "powder", "прах$", "грама", "\\d+\\s?(?:g|г|kg|кг)$", "мг$", "mg$", "chocolate", "шоколад", "бар$", "bar$",
  "напитка", "drink", "shot$",
  // audit additions
  "тетрадк", "кутия с ластик", "чанта за храна", "кутия за храна", "a4$", "а4$", "a5$", "а5$", "сос$", "оцет", "двигателно", "балсам", "за съдове", "фиби", "за коса", "world of warcraft", "diablo", "gorjuss", "препарат",
  "адаптирано мляко", "машина за", "бебешк", "за бебета",
  // review round 1: school and children's bottles
  "coolpack", "за деца", "детск", "spiderman", "spider-man", "disney", "minnie", "mickey", "barbie", "hello kitty", "kuromi",
  "frozen$", "paw patrol", "pokemon", "marvel", "peppa", "unicorn", "еднорог",
);

/** ZMA (zinc + magnesium + B6 for athletes): a sports mineral, filed under Магнезий (review round 1 scope change). */
export const ZMA = kw("zma", "зма$", "zmb$", "zincma", "mgzb", "zm-complex", "zn mg b6");

export const HORMONAL_STRONG: Rule[] = [
  [
    "za-mazhe",
    kw(
      "тестостерон", "testosteron", "testo", "тесто$", "tribulus", "трибулус", "бабини зъби", "tongkat", "тонгкат", "fadogia",
      "d-?аспарагинова", "d-?aspartic", "daa$", "zma$", "зма$", "простат", "prostat", "saw palmetto", "сао палмето", "сереноа",
      "serenoa", "hgh", "gh surge", "gh stimulant", "growth hormone", "растежен хормон", "aromatase", "ароматаза", "естрогенен блокер",
      "estrogen blocker", "dhea$", "pregnenolon", "прегненолон", "horny goat", "epimedium", "епимедиум", "мъжка сила",
      "мъжка активност", "мъжка потентност", "за мъжка", "за мъжко", "fertility for men", "мъжка фертилност", "сперм", "sperm",
    ),
  ],
  [
    "bremennost",
    kw(
      "бременн", "pregnan", "prenatal", "пренатал", "кърмачк", "кърмене", "breastfeed", "lactation", "лактац", "зачеване",
      "conception", "hey mama", "supplemaman", "сюплемаман", "femibion", "фемибион", "elevit", "елевит",
    ),
  ],
  [
    "za-zheni",
    kw(
      "менопауза", "menopaus", "климакс", "пмс", "pms$", "предменструален", "менструал", "menstrua", "фертил", "fertil",
      "мио-?инозитол", "myo-?inositol", "d-?chiro", "пкос", "pcos", "поликистоз", "хормонален баланс", "hormone balance",
      "hormonal balance", "женски хормон", "естроген", "estrogen", "фитоестроген", "изофлавон", "isoflavon", "червена детелина",
      "red clover", "promensil", "промензил", "див ям", "wild yam", "vitex", "витекс", "agnus castus", "авраамово дърво", "d-?манноза",
      "d-?mannose", "cranberry", "червена боровинка", "уринарн", "пикочни пътища", "пикочен мехур", "цистит", "бюст", "breast",
      "вагинална флора", "интимна флора", "интимен баланс", "femi", "феми",
    ),
  ],
];

// Audit: whey / isolate / casein powders often have a snack flavour ("Cookies and Cream", "Бисквитки с крем"). A name with a
// whey word and NO bar / wafer word and no "protein cookie / pudding …" pair is a powder; so is a big pack or a dose count.
const NO_SNACK =
  "^(?!.*(?<![\\p{L}\\p{N}])(?:бар|барче|барчета|bar|bars|wafer|вафла|вафли|flapjack|флапджак)(?![\\p{L}\\p{N}]))" +
  "(?!.*(?:protein|протеинов[аио]?)\\s(?:cookie|бисквит|pudding|пудинг|chips|чипс|crackers?|крекер|brownie|брауни|donut|донът|puffs|bites|хапк|snack|снакс))";
const WHEY_WORD = "(?<![\\p{L}\\p{N}])(?:whey|суроватъч|isolate|изолат|casein|казеин|wpc|wpi|протеинова матрица|protein matrix)";
/** Guard of the protein-bar rule: a protein powder with a snack flavour, or "908 грама, 30 Дози". */
export const PROTEIN_POWDER_NAME = ure(`${NO_SNACK}.*${WHEY_WORD}|\\d{3,4}\\s?(?:г|g|гр|грама)(?:[\\p{L}\\p{N}]|$)?.{0,20}дози`, "iu");
/** A protein POWDER (then PROTEIN_GUARD's cookie / cream flavours don't block the protein rules). */
export const PROTEIN_POWDER = ure(
  `${NO_SNACK}.*${WHEY_WORD}|(?<![\\p{L}\\p{N}])(?:\\d+\\s?дози|servings|powder|на прах)|\\d+(?:[.,]\\d+)?\\s?(?:kg|кг)(?![\\p{L}\\p{N}])` +
    `|(?:[2-9]\\d{2}|\\d{4})\\s?(?:g|г|гр|грама)(?![\\p{L}\\p{N}])|[1-9](?:\\.\\d+)?g\\.|0\\.[4-9]\\d*g\\.`,
  "iu",
);

export const HEALTHY_FOOD_RULES: Rule[] = [
  [
    "proteinovi-barove",
    kw(
      "протеинов(?:о|и|а)? (?:бар|барче|барчета|вафл|бисквит|кекс|брауни|чипс|снакс|хапк|топчет|пудинг|десерт|кроасан|мъфин|крекер|пай|кекс)",
      "protein (?:bar|wafer|cookie|brownie|chips|crisps|snack|bites|balls|pudding|dessert|muffin|cake|crunch|puffs|pops|donut|crispies|flapjack|pie|popcorn|pretzel)",
      "hi-?protein bar", "high protein bar", "barebells", "бар$", "барче", "барчета", "bar$", "bars$", "вафла", "вафли", "wafer",
      "бисквит", "cookie", "брауни", "brownie", "кекс", "mug cake", "flapjack", "флапджак", "energy bar", "енергиен бар", "raw bar",
      "хапки", "bites$", "rawllin", "пудинг", "pudding", "десерт", "dessert", "чипс", "chips", "crisps", "puffs", "крекер", "cracker",
      "oat bakes", "мъфин", "muffin", "донът", "donut", "пуканки", "popcorn", "протеинов шоколад", "protein chocolate",
      "шоколад без захар", "chocolate no sugar", "sugar free chocolate", "pops$", "snack$", "снакс",
    ),
    // Audit: a protein POWDER with a cookie / wafer flavour ("Iso Whey Zero - Cookies and Cream") is not a bar.
    PROTEIN_POWDER_NAME,
  ],
  [
    "yadkovi-masla",
    kw(
      "фъстъчено масло", "peanut butter", "бадемово масло", "almond butter", "кашу масло", "cashew butter", "лешниково масло",
      "hazelnut butter", "ядково масло", "ядков крем", "nut butter", "тахан", "тахини", "tahini", "протеинов крем", "protein cream",
      "protein spread", "шоколадов крем", "лешников крем", "spread$", "peamix", "protella", "протела", "powdered peanut",
      "фъстъчено брашно", "фъстъчен крем", "крем от лешник", "крем от фъстъци", "паста от ядки",
    ),
    kw("whey", "суроватъч", "isolate", "изолат", "casein", "казеин", "gainer", "гейнър", "bcaa", "eaa$", "amino", "креатин", "creatine"),
  ],
  [
    "zakuska",
    kw(
      "овесени ядки", "овесена каша", "овесени трици", "овесен", "oats$", "oat mash", "instant oats", "oatmeal", "porridge", "мюсли",
      "muesli", "гранола", "granola", "зърнена закуска", "cereal$", "микс за палачинки", "палачинк", "pancake", "оризовк",
      "оризови вафли", "оризови галет", "rice cakes", "corn cakes", "царевични вафли", "галет", "протеинов хляб", "protein bread",
      "протеинова паста", "protein pasta", "high protein pasta", "pastayoung", "конджак", "konjac", "shirataki", "ширатаки",
      "кето хляб", "keto bread", "протеиново мюсли", "протеинови палачинки", "cream of rice", "оризов крем", "протеинова каша",
      "protein porridge", "waffle mix", "гофрети",
    ),
  ],
  [
    "sirop-sosove-podsladiteli",
    kw(
      "zero sauce", "zero syrup", "сос zero", "сироп zero", "0 ?kcal", "0 калории", "нискокалоричен сос", "skinny sauce",
      "skinny syrup", "fit sauce", "фит сос", "кетчуп без захар", "sugar[- ]?free syrup", "сироп без захар",
      "(?:сироп|сос|конфитюр|джем|желе)[^\\n]{0,30}без (?:добавена )?захар", "fruits in jelly", "in jelly", "frulove", "фрулав",
      "flavou?r drops", "вкусови капки", "flavdrops", "подсладител", "sweetener", "стевия", "stevia", "еритритол", "erythritol",
      "ксилитол", "xylitol", "сукралоза", "sucralose", "монк фрут", "monk fruit", "алулоза", "allulose", "агаве", "agave",
      "кокосова захар", "coconut sugar", "кленов сироп", "maple syrup", "сироп от (?:ориз|фурми|агаве|ечемик|цикория|якон)", "yacon",
      "якон", "sukrin", "zero$", "диетичен конфитюр", "диетично желе", "jelly zero", "zero jelly", "sauce zero", "syrup zero",
      "шоколадов сироп", "chocolate syrup", "маслен спрей", "cooking spray", "спрей за готвене", "olive oil spray",
    ),
    kw("whey", "суроватъч", "isolate", "изолат", "casein", "казеин", "gainer", "гейнър", "bcaa", "eaa$", "amino", "креатин", "creatine", "collagen", "колаген"),
  ],
  [
    "med-i-pchelni-produkti",
    kw("пчелен мед", "мед от", "мед$", "manuka", "манука", "honey$", "мед с ", "петмез", "перга", "медена"),
  ],
  [
    "superhrani",
    kw(
      "спирулина", "spirulina", "хлорела", "chlorella", "моринга", "moringa", "ечемичена трева", "barley grass", "пшенична трева",
      "wheatgrass", "зелени храни", "greens$", "super ?greens", "superfood", "суперхран", "суперфуд", "чия", "chia", "ленено семе",
      "flax ?seed(?! oil)", "конопено семе", "hemp seed(?! oil)", "hemp hearts", "годжи", "goji", "асаи на прах", "acai powder",
      "мака на прах", "maca powder", "какао на прах", "сурово какао", "raw cacao", "cacao nibs", "какаови зърна", "какаови бобчета",
      "cocoa beans", "куркума на прах", "turmeric (?:root )?powder", "цвекло на прах", "beetroot powder", "хранителна мая",
      "nutritional yeast", "ябълков оцет", "apple cider vinegar", "fruits & greens", "аронія", "арония на прах", "шипки на прах",
      "камут", "kamut", "каму-?каму", "camu camu", "лукума", "lucuma", "баобаб", "baobab", "psyllium husk powder",
    ),
  ],
  [
    "yadki-i-semena",
    kw(
      "ядки$", "nuts$", "бадеми", "almonds", "орехи", "walnuts", "кашу$", "cashew", "лешници", "hazelnuts", "фъстъци", "peanuts",
      "пекан", "pecan", "макадамия", "macadamia", "бразилски орех", "brazil nuts", "шам фъстък", "pistachio", "сушени плодове",
      "dried fruit", "фурми", "dates$", "стафиди", "raisins",
      "сушени (?:боровинки|сливи|кайсии|смокини|ягоди|ябълки|манго|банан|черници|физалис)", "кокосови стърготини", "тиквени семки",
      "тиквено семе$", "слънчогледово семе", "семена$", "seeds$", "киноа", "quinoa", "амарант", "amaranth", "тигрови ядки", "chufa",
      "чуфа", "семки",
    ),
  ],
  [
    "napitki",
    kw(
      "протеиново кафе", "protein coffee", "кафе с (?:колаген|гъби|mct|протеин|рейши|лъвска)", "mushroom coffee", "гъбено кафе",
      "keto coffee", "протеинова напитка", "protein drink", "протеиново мляко", "protein milk", "rtd$", "ready to drink",
      "готова напитка", "комбуча", "kombucha", "алое вера (?:сок|напитка|гел за пиене|за пиене)", "aloe vera (?:juice|drink|gel)",
      "гел за пиене", "нони", "noni",
      "сок от (?:арония|нар|годжи|облепиха|морски зърнастец|цвекло|червено цвекло|коприва|алое|ацерола|бял равнец|пирен|живовляк)",
      "пробиотичен сок", "ферментирал сок", "витаминозна вода", "vitamin water", "functional drink", "функционална напитка",
      "coffee extreme", "кафе екстрийм", "carni-?tea", "oshee", "протеинов шейк rtd", "protein shake rtd", "iso drink",
      "енергийна напитка без захар", "matcha latte", "матча лате", "golden milk", "златно мляко", "chicory", "цикория",
    ),
  ],
];

export const MEAL_REPLACEMENT = kw(
  "заместител на хран", "заместители на хран", "meal replacement", "mrp$", "diet shake", "диетичен шейк", "slim shake",
  "shake 4 fit", "fit & slim", "shape & control", "weight loss shake", "шейк за отслабване", "shape shake", "diet whey",
  "keto fit", "raw meal", "fat burning protein shake", "ultra loss shake", "lean shake", "форевър лийн", "forever lean", "meal$",
  "meal shake", "slim protein", "diet protein", "diet whey", "impact diet", "протеинов шейк за отслабване",
  "протеинов шейк за жени", "shake for women", "cutting protein",
);

export const GAINER = kw(
  "гейнър", "гейнер", "gainer", "mass$", "масов гейнър", "high carb", "bulk-?xt", "mass build", "hyper mass", "serious mass",
  "mutant mass",
);

export const COLLAGEN = kw("колаген", "collagen", "пептан", "peptan", "verisol", "верисол", "fortigel", "uc-?ii", "тип ii", "type ii");

export const BEAUTY_MARK = kw(
  "красота", "beauty", "кожа", "кожата", "skin$", "коса", "косата", "hair$", "нокти", "nails", "хиалурон", "hyaluron", "verisol",
  "верисол", "glow", "лице", "бръчки", "anti-?age", "anti-?aging", "еластин", "elastin", "caviar", "хайвер", "морски", "marine",
  "fish collagen", "рибен колаген", "beauty elixir", "бюти",
);

export const JOINT_MARK = kw(
  "стави", "ставите", "ставн", "joint", "flex", "arthro", "артро", "хрущял", "cartilage", "сухожили", "tendon", "лигамент",
  "ligament", "кости", "bone", "uc-?ii", "тип ii", "type ii", "fortigel", "глюкозамин", "glucosamin", "хондроитин", "chondroitin",
  "msm$",
);

export const PROTEIN_RULES: Rule[] = [
  [
    "kazein",
    kw("казеин", "casein", "micellar", "мицеларен", "мицеларна", "night protein", "нощен протеин", "overnight protein", "calcium caseinate"),
  ],
  [
    "rastitelen-protein",
    kw(
      "растителен протеин", "растителни протеини", "plant protein", "plant-based protein", "plant based protein", "vegan protein",
      "веган(?:ски)? протеин", "грахов протеин", "pea protein", "соев протеин", "soy protein", "оризов протеин", "rice protein",
      "конопен протеин", "hemp protein", "тиквен протеин", "pumpkin (?:seed )?protein", "слънчогледов протеин", "vegan 100 protein",
      "vegan blend", "clear vegan", "веган шейк", "vegan shake", "протеинов микс", "protein fit", "енерзона ®веган", "ензона веган",
      "plant superblend", "vegan$", "веган$", "vege protein", "протеин от грах",
    ),
    // review round 1: "…, 300 таблетки, 100% Vegan" (EAA, shilajit) is not a plant protein powder
    kw("капсул", "таблет", "caps$", "capsules", "tabs$", "tablets", "екстракт", "extract", "shilajit", "шилажит", "eaa$"),
  ],
  [
    "drugi-proteini",
    kw(
      "beef protein", "говежди протеин", "говежди изолат", "beef isolate", "egg (?:white )?protein", "яйчен протеин", "яйчен белтък",
      "multi-?component", "протеинова матрица", "protein matrix", "\\d proteins", "animal 8", "многокомпонентен", "fish protein",
      "chicken protein", "протеинов бленд от", "protein blend of", "egg white",
    ),
  ],
  [
    "protein-izolat",
    kw(
      "изолат", "isolate", "iso$", "iso whey", "isowhey", "iso pro", "iso[- ]?100", "isoflex", "isopure", "iso plus", "iso sensation",
      "iso zero", "iso surge", "isoprime", "iso-?9", "хидролизат", "хидролизиран суроватъчен", "hydrolys", "hydro whey", "hydrowhey",
      "clear whey", "wpi$", "wpi\\s?\\d+", "whey isolate", "iso gold", "iso clear", "iso triple", "black cfm", "iso-?fuji",
      "isolate protein",
    ),
  ],
  [
    "surovatachen-protein",
    kw(
      "суроватъчен", "суроватка", "суроватъчни", "whey", "wpc$", "wpc\\s?\\d+", "протеин$", "протеини$", "протеинова смес", "protein$",
      "protein blend", "протеинов шейк", "protein shake", "protein powder", "протеин на прах", "nitrotech", "gold standard 100",
      "100% whey", "impact whey", "combat", "levrowhey", "anabolic whey", "syntha-?6", "protein 80", "protein 85", "protein complex",
      "протеинов комплекс", "hi protein", "high protein$", "protein 90",
    ),
  ],
];



export const PROTEIN_GUARD = kw(
  "колаген", "collagen", "бар$", "bar$", "барче", "вафл", "бисквит", "cookie", "брауни", "chips", "чипс", "пудинг", "pudding",
  "палачинк", "pancake", "паста$", "pasta$", "крем$", "(?<!ice )cream$", "spread", "хляб", "bread",
);

export const CREATINE = kw(
  "креатин", "creatin", "creapure", "креапур", "кре-?алкалин", "kre-?alkalyn", "tri-?creatine", "tcm$", "creatine hcl",
  "crea-?ethyl", "creactor", "crea ethyl", "cell-?tech", "creabolic",
);

export const CREATINE_MONO = kw(
  "монохидрат", "monohydrate", "creapure", "креапур", "micronized creatine", "микронизиран креатин", "creatine 100%",
  "100% creatine", "creatine powder", "creatine caps", "creatine tablets", "creatine pure",
);

export const CREATINE_OTHER = kw(
  "hcl$", "хидрохлорид", "hydrochloride", "малат", "malate", "tcm$", "tri-?creatine", "кре-?алкалин", "kre-?alkalyn", "етил естер",
  "ethyl ester", "нитрат", "nitrate", "оротат", "orotate", "цитрат", "citrate", "пируват", "pyruvate", "matrix", "матрица",
  "complex", "комплекс", "stack", "charged", "effervescent", "ефервесцент", "creactor", "cell-?tech", "magna", "creabolic",
  "anabolic", "multi", "мулти", "creatine sport", "shot$", "drink$", "напитка", "gummies", "дъвчащи",
);

export const PRE_WORKOUT = kw(
  "предтренировъч", "пред-тренировъч", "pre-?workout", "pre-?train", "pre workout", "пре-?тренировъчен", "азотен бустер",
  "азотни бустери", "nitric oxide", "no[- ]booster", "no-?xplode", "pump$", "c4$", "c4 ", "jack3d", "noxpump", "psychotic",
  "total war", "the curse", "stim-?free", "non-?stim", "godzilla", "warcry", "blood (?:&|and) guts", "m6teen", "abe$", "a\\.b\\.e",
  "shaaboom", "madness", "redweiler", "n1 pre", "no jokes", "legend pre", "wrecked", "pre-?jym", "pre-?kaged", "bullnox",
  "pump-?ed", "pumped", "stim$", "high stim", "hyperpump", "pre$", "essential pre", "ultra pump", "vasodilator", "вазодилатор",
  "nitrosigine", "focus pre", "pre-?w", "shotgun", "mesomorph", "pre-?shot", "invader", "black hole", "napalm",
);

export const CARNITINE = kw(
  "карнитин", "carnitin", "carni ", "carni$", "carnipure", "carnizone", "carni-?tea", "carniline", "icarnitine", "l-?carni",
  "alcar$", "ацетил л-карнитин", "ацетил-л-карнитин", "l-karnityna", "carni 4000", "karnityna",
);

export const AMINO_RULES: Rule[] = [
  [
    "eaa",
    kw(
      "eaa", "еаа", "незаменими аминокиселини", "есенциални аминокиселини", "essential amino", "eaanabol", "amino eaa", "eaamino",
      "eaa\\+", "eaa's",
    ),
  ],
  [
    "bcaa",
    kw(
      "bcaa", "бцаа", "бкаа", "branched chain", "разклонени", "разклонена верига", "2:1:1", "4:1:1", "8:1:1", "10:1:1", "12:1:1",
      "xtend", "amino x", "bcaa's",
    ),
  ],
  ["glutamin", kw("глутамин", "glutamin")],
  [
    "drugi-aminokiselini",
    kw(
      "аргинин", "arginin", "цитрулин", "citrullin", "aakg", "a-akg", "орнитин", "ornithin", "бета[- ]?аланин", "beta[- ]?alanin",
      "таурин", "taurin", "hmb$", "хмб", "левцин", "leucin", "изолевцин", "isoleucin", "валин", "valin", "лизин", "lysin", "тирозин",
      "tyrosin", "фенилаланин", "phenylalanin", "глицин$", "glycine?$", "теанин", "theanin", "метионин", "methionin", "цистеин", "cystein",
      "цистин", "cystin", "хистидин", "histidin", "треонин", "threonin", "триптофан", "tryptophan", "пролин", "prolin", "аспарагинова",
      "aspartic", "карнозин", "carnosin", "аминокиселин", "amino acid", "amino$", "аминo", "amino complete", "amino \\d+",
      "beef amino", "liquid amino", "аминокомплекс", "agmatin", "агматин", "бетаин", "betain", "tmg$", "d-?рибоза", "d-?ribose",
      "креатинол", "gaba$", "габа$", "hydro amino", "amino energy", "amino recovery", "amino drink", "amino shot", "aminolast",
      "amino fuel", "whey amino", "megabol inh",
    ),
  ],
];

export const ENERGY_RULES: Rule[] = [
  [
    "elektroliti-i-vaglehidrati",
    kw(
      "електролит", "electrolyt", "изотоник", "изотонич", "isotonic", "hydration", "хидратация", "iso drink", "isostar", "oshee",
      "vitargo", "витарго", "малтодекстрин", "maltodextrin", "декстроза", "dextrose", "cyclic dextrin", "cluster dextrin",
      "highly branched", "карбо$", "carbo$", "carbs$", "въглехидрат", "carbohydrate", "glycofuse", "waxy maize", "carbo loader",
      "palatinose", "палатиноза", "endurance formula", "zerolyte", "aqua kick", "salt caps", "солни таблетки", "sodium caps",
      "raw fuel", "fuel$", "carbo gel", "маратон", "endurance", "издръжливост", "recovery drink", "възстановяване",
    ),
  ],
  [
    "energia-i-kofein",
    kw(
      "енергиен гел", "енергийни гелове", "energy gel", "енергийна напитка", "energy drink", "енергиен шот", "energy shot", "кофеин",
      "caffeine", "гуарана", "guarana", "power gel", "isotonic gel", "energy chews", "energy powder", "energy booster",
      "енергиен бустер",
    ),
  ],
  // Audit: the weak words ("energy", "gel", "shot" …) also appear in vitamin names ("Витамин В2 - Клетъчна енергия"), brand
  // names ("Swiss Energy") and "гел капсули" — such products go on to the ingredient rules (stage B).
  [
    "energia-i-kofein",
    kw(
      "energy$", "енергия$", "gel(?!\\s*caps)$", "гел(?!\\s*капсул)$", "shot$", "шот$", "smart energy", "енергизиращ", "енергизиращи",
      "energize", "енерджи", "енергетик",
    ),
    kw(
      "витамин", "vitamin", "мултивит", "multivit", "магнези", "magnesi", "желязо", "iron$", "цинк", "zinc", "калций", "calcium",
      "коензим", "coenzyme", "q10", "omega", "омега", "капсул", "caps$", "capsules", "таблет", "tablets", "tabs$", "softgel", "софтгел",
      "cellulite", "целулит", "dmso",
    ),
  ],
];

export const WEIGHT_RULES: Rule[] = [
  [
    "fet-barnari",
    kw(
      "фет бърнър", "фет-бърнър", "фетбърнър", "fat burn", "fatburn", "burner$", "бърнър", "термоген", "thermogen", "thermo$",
      "lipo(?!som|ic|zom)", "липо(?!ев|зом|лит)", "cuts$", "ripper", "shred", "stim free burner", "t5$", "hydroxycut", "slim$",
      "slimming", "отслабване", "за отслабване", "weight loss", "weight management", "кетон", "ketone", "bhb$", "raspberry ketone",
      "малинови кетони", "зелено кафе", "green coffee", "garcinia", "гарциния", "yohimbin", "йохимбин", "синефрин", "synephrin",
      "калори бърн", "calorie burn", "наднормено тегло", "изгаряне на мазнини", "метаболизъм на мазнини", "cut$", "lean$", "fat loss",
      "fat metaboli", "animal cuts", "black spider", "lipo-?6", "keto diet", "кето диета", "thermo fat", "fat binder", "fat block",
      "fat-?x", "анти целулит", "anti-?cellulite", "целулит",
    ),
    // review round 1: "Липомезин … при повишен холестерол", "lipoacid … за бляскава кожа" are not fat burners
    kw("холестерол", "cholesterol", "триглицерид", "triglycerid", "за кожа", "за кожата", "бляскава кожа", "еластична кожа", "skin$"),
  ],
  [
    "apetit-i-blokeri",
    kw(
      "cla$", "cla \\d", "cla\\+", "конюгирана линолова", "conjugated linoleic", "tonalin", "тоналин", "глюкоманан", "glucomannan",
      "chitosan", "хитозан", "калорекс", "calorex", "апетит", "appetite", "carb blocker", "блокер на въглехидрати", "starch blocker",
      "бял боб екстракт", "white kidney bean", "phase 2", "фаза 2", "калорийн", "засищане", "satiety",
    ),
  ],
  [
    "detoks",
    kw(
      "детокс", "detox", "диуретик", "diuretic", "water out", "против задържане на вода", "задържане на вода", "дрениращ", "drain$",
      "drainage", "cleanse", "пречистване на организма", "пречистваща", "активен въглен", "activated charcoal", "charcoal", "зеолит",
      "zeolite", "бентонит", "отводняване", "отводняващ", "hydroburn", "aqua out", "water away", "колон", "colon",
    ),
  ],
];

export const OMEGA_RULES: Rule[] = [
  ["krilovo-maslo", kw("крил$", "крилово", "krill")],
  [
    "omega-3-6-9-i-mct",
    kw(
      "омега[- ]?3[- ,/]*6[- ,/]*9", "omega[- ]?3[- ,/]*6[- ,/]*9", "3[- ]6[- ]9", "вечерна иглика", "evening primrose", "пореч",
      "borage", "ленено масло", "flaxseed oil", "flax oil", "flax seed oil", "масло от черен кимион", "black (?:cumin|seed) oil",
      "черен кимион", "nigella", "масло от тиквено семе", "pumpkin seed oil", "масло от морски зърнастец", "sea buckthorn oil",
      "облепиха", "mct", "средноверижни триглицериди", "gla$", "linoleic", "конопено масло", "hemp oil", "hemp seed oil",
      "масло от черен дроб на акула", "shark liver", "сквален", "squalene", "омега 7", "omega[- ]?7", "омега[- ]?9",
      "масло от зародиш", "wheat germ oil", "масло от семена", "масло от нар", "масло от шипка за пиене",
    ),
  ],
  [
    "omega-3",
    kw(
      "омега[- ]?3", "omega[- ]?3", "рибено масло", "рибеното масло", "fish oil", "масло от черен дроб на треска",
      "черен дроб на треска", "cod liver", "треска", "salmon oil", "масло от сьомга", "сьомга", "epa$", "dha$", "епа$", "дха$",
      "водорасли", "algae oil", "algal", "калмар", "squid", "sardine", "anchov", "rxomega", "proomega", "ultimate omega",
      "super omega", "omega$", "омега$", "мастни киселини", "fatty acids", "моллер", "moller", "möller",
    ),
  ],
];

export const JOINT_RULES: Rule[] = [
  [
    "glyukozamin-hondroitin-msm",
    kw("глюкозамин", "glucosamin", "хондроитин", "chondroitin", "msm$", "мсм$", "метилсулфонилметан", "methylsulfonylmethane", "метил-сулфонил"),
  ],
];

export const JOINT_COMPLEX = kw(
  "стави", "ставите", "ставни", "ставна", "joint", "joints", "flex$", "flexit", "arthro", "артро", "хрущял", "cartilage",
  "boswellia", "босвелия", "дяволски нокът", "devil'?s claw", "teufelskralle", "сухожили", "tendon", "лигамент", "ligament",
  "osteo", "остео", "кости", "костите", "костна", "bone$", "bones$", "osteoporos", "остеопороза", "animal flex", "arthoxon",
  "артоксон", "синовиал", "synovial", "мускули и стави", "стави и мускули", "хиалуронова киселина за стави", "номер 7", "no\\. 7",
);

export const STAGE_B: [string, RegExp][] = [
  [
    "multivitamini",
    kw(
      "мултивитамин", "multivitamin", "multi[- ]?vit", "мулти витамин", "мултивит", "витамини и минерали",
      "vitamins? (?:&|and|и) minerals?", "мултиминерал", "multimineral", "vita-min", "a-z$", "от а до я", "a to z", "daily set",
      "dailyset", "vita pak", "animal pak", "opti-?men", "opti-?women", "one daily", "one a day", "centrum", "центрум", "supradyn",
      "супрадин", "витаминен комплекс", "vitamin complex", "комплекс от витамини", "ultravit", "gold-?vit(?! c| b| d)",
      "v-itamin complex", "daily formula", "vita min", "витамини$", "vitamins$", "мулти-витамин", "multi-vitamin", "мултивитамини",
      "витамини за", "sentry", "vit&min", "vitamin pack", "вита комплекс",
    ),
  ],
  [
    "vitamin-d",
    kw(
      "витамин[- ]?[dд]\\d?", "vitamin[- ]?d\\d?", "d3$", "д3$", "d-3$", "d3\\+", "d3 ", "холекалциферол", "cholecalciferol",
      "k2\\s?\\+\\s?d3", "к2\\s?\\+\\s?д3", "sun-?d", "vit d", "витамин[- ]?д$", "вит. d", "вит.d", "d-vitamin",
    ),
  ],
  [
    "vitamin-c",
    kw(
      "витамин[- ]?[cс]$", "vitamin[- ]?c$", "аскорбин", "ascorb", "ester-?c", "ацерола", "acerola", "шипк", "rose ?hips",
      "c[- ]?1000", "c[- ]?500", "vit c", "pureway-?c", "вит\\.? ?c", "вит\\.? ?с", "liposomal c", "липозомен витамин c", "цитровит",
      "c-vitamin",
    ),
  ],
  [
    "vitamin-b",
    kw(
      "витамин[- ]?b\\d*", "vitamin[- ]?b\\d*", "витамин[- ]?б\\d*", "b[- ]?complex", "б[- ]?комплекс", "b[- ]?комплекс", "b-?50",
      "b-?100", "b12", "б12", "b6$", "б6$", "b1$", "b2$", "b3$", "b5$", "b9$", "biotin", "биотин", "фолиев", "folic", "folate",
      "фолат", "метилфолат", "methylfolate", "ниацин", "niacin", "тиамин", "thiamin", "рибофлавин", "riboflavin", "пантотен",
      "pantothen", "пиридоксин", "pyridox", "p-5-p", "кобаламин", "cobalamin", "холин", "cholin", "инозитол", "inositol", "бирена мая",
      "brewer'?s yeast", "бенфотиамин", "benfotiamin", "methyl b", "vit b", "вит. b", "gold vit b", "b-vitamin", "метилкобаламин",
    ),
  ],
  [
    "drugi-vitamini",
    kw(
      "витамин[- ]?[aаeеkк]\\d?$", "vitamin[- ]?[aek]\\d?$", "k2$", "к2$", "mk-?7", "менахинон", "menaquinon", "бета[- ]?каротин",
      "beta[- ]?carotene", "токоферол", "tocopher", "a-d-e-k", "adek", "vit e", "vit a", "vit k", "витамин[- ]?[aаeеkк] \\d",
    ),
  ],
  [
    "magnezii",
    kw(
      "магнезий", "magnesium", "магнезиев", "mg\\s?\\+\\s?b6", "mg\\s?\\+\\s?в6", "magne$", "магне$", "магнефорс", "magnefors",
      "магнехарт", "magnesia", "magnez", "magnesium-?b6",
    ),
  ],
  ["tsink", kw("цинк", "zinc", "zink", "цинков")],
  [
    "zhelyazo",
    kw(
      "желязо", "iron$", "ferrum", "ферум", "ferro", "феро", "железен", "железни", "floradix", "флорадикс", "ferroglobin",
      "фероглобин", "haem", "хем$", "хемово",
    ),
  ],
  ["kaltsii", kw("калций", "calcium", "калциев", "cal-?mag", "кал-маг", "калцикор")],
  [
    "drugi-minerali",
    kw(
      "селен", "selen", "йод", "iodine", "iodide", "калий$", "калиев", "potassium", "хром", "chrom", "бор$", "boron", "copper",
      "мед (?:глюконат|бисглицинат|цитрат)", "манган", "mangan", "молибден", "molybden", "литий", "lithium", "силиций", "silica",
      "silicon", "ванадий", "vanad", "минерали", "minerals", "колоиден", "colloid", "алкализ", "alkalin", "trace minerals",
      "микроелемент", "електролитен баланс", "шуслер", "сяра", "sulfur", "sulphur", "стронций", "strontium", "фосфор", "phosphor",
      "натриев бикарбонат", "сода бикарбонат", "coral", "коралов",
    ),
  ],
  ["glyukozamin-hondroitin-msm", JOINT_RULES[0][1]],
  ["kolagen-i-hialuron", kw("хиалурон", "hyaluron")],
  [
    "kosa-kozha-nokti",
    kw(
      "коса", "косата", "hair(?![^\\W_])", "нокти", "ноктите", "nails", "кожа$", "кожата", "skin(?![^\\W_])", "красота", "beauty",
      "perfectil", "перфектил", "кератин", "keratin", "бръчки", "бронз", "тен$", "glow", "hair skin nails", "косопад", "hair loss",
      "imedeen", "имедин", "inneov", "иннеов", "виталия коса", "livsane за коса",
    ),
  ],
  [
    "probiotitsi-i-hranosmilane",
    kw(
      "пробиоти", "probiotic", "пребиоти", "prebiotic", "синбиоти", "synbiotic", "постбиот", "postbiot", "лактобацил", "lactobacil",
      "бифидо", "bifido", "acidophilus", "ацидофилус", "sacchar", "захаромицес", "сахаромицес", "чревн", "gut$", "digest", "храносмил",
      "ензим", "enzyme", "enzym", "лактаза", "lactase", "папаин", "papain", "бромелаин", "bromelain", "псилиум", "psyllium", "фибри",
      "fiber$", "fibre$", "инулин", "inulin", "стомах", "stomach", "стомашно-чревн", "газове", "метеоризъм", "подуване", "bloat",
      "запек", "constipation", "лаксатив", "laxative", "сена$", "senna", "бутират", "butyrate", "butyric", "флора", "flora",
      "microbiome", "микробиом", "linex", "линекс", "кефирни", "billion", "млрд", "колит", "irritable", "дебело черво",
      "храносмилателн", "перисталтик", "чревни паразити", "паразит", "parasit", "vermi",
    ),
  ],
  [
    "imunitet",
    kw(
      "имун", "immun", "ехинацея", "echinacea", "черен бъз", "бъз(?![^\\W_])", "elderberry", "sambucus", "самбукус", "бета[- ]?глюкан",
      "beta[- ]?glucan", "коластра", "colostrum", "колострум", "прополис", "propolis", "пчелно млечице", "royal jelly",
      "пчелен прашец", "bee pollen", "полен$", "лактоферин", "lactoferrin", "кверцетин", "quercetin", "устойчивост", "дихателн",
      "respirat", "гърло", "throat", "бели дробове", "lung", "бронх", "синус", "sinus", "септилин", "septilin", "настинк", "грип",
      "cold & flu", "cold and flu", "противовирус", "antiviral", "антибактериал", "antibacterial", "мащерка и иглика",
      "исландски лишей", "iceland moss", "исландски мъх", "живовляк", "plantain", "лопен", "mullein", "сладник", "licorice",
      "женско биле", "бяла ружа", "marshmallow root", "алергии", "allerg", "хистамин", "histamin", "пастили", "lozenge",
      "таблетки за смучене", "за смучене",
    ),
  ],
  [
    "antioksidanti",
    kw(
      "антиоксидант", "antioxidant", "коензим", "coenzyme", "q[- ]?10", "ubiquinol", "убихинол", "убихинон", "ресвератрол",
      "resveratrol", "глутатион", "glutathion", "nac$", "n-?ацетил", "n-?acetyl", "алфа[- ]?липоева", "alpha[- ]?lipoic", "ala$",
      "липоева", "lipoic", "астаксантин", "astaxanthin", "pqq", "nmn$", "nad\\+", "nad$", "nr$", "никотинамид рибозид",
      "nicotinamide riboside", "спермидин", "spermidin", "ликопен", "lycopen", "гроздово семе", "grape seed", "опц$", "opc$",
      "пикногенол", "pycnogenol", "сулфорафан", "sulforaphan", "фисетин", "fisetin", "уролитин", "urolithin", "геропротект",
      "geroprotect", "autophagy", "автофаги", "longevity", "дълголет", "anti-?aging", "anti-?ageing", "клетъчн", "cellular",
      "митохондри", "mitochondri", "sod$", "супероксид", "полифенол", "polyphenol", "флавоноид", "flavonoid", "биофлавоноид",
      "bioflavonoid", "хесперидин", "hesperidin", "кемферол", "olive leaf", "маслинови листа", "маслинов лист", "oleuropein",
      "hydroxytyrosol", "хидрокситирозол", "resveracel", "mitoq", "senolytic",
    ),
  ],
  [
    "sartse-i-kravoobrashtenie",
    kw(
      "сърце", "сърдеч", "heart", "cardio", "кардио", "холестерол", "cholesterol", "кръвно налягане", "кръвното", "blood pressure",
      "normal pressure", "кръвоносн", "кръвообращ", "circulation", "вени$", "венозн", "vein", "varicose", "разширени вени",
      "див кестен", "horse chestnut", "червен ферментирал ориз", "red yeast rice", "наттокиназа", "nattokinase", "поликозанол",
      "policosanol", "глог", "hawthorn", "триглицерид", "triglycerid", "диосмин", "diosmin", "рутин", "rutin", "кръвосъсирване",
      "артерии", "arteri", "артериал", "коензим q10 за сърцето", "хемороид", "капиляри", "capillar", "цереброваскулар",
    ),
  ],
  [
    "mozak-i-pamet",
    kw(
      "памет", "memory", "концентрац", "focus", "фокус", "мозък", "мозъч", "brain", "когнитив", "cognit", "ноотроп", "nootrop",
      "гинко", "ginkgo", "ginko", "бакопа", "bacopa", "брахми", "brahmi", "lion'?s mane", "лъвска грива", "alpha[- ]?gpc",
      "фосфатидилсерин", "phosphatidylserin", "цитиколин", "citicolin", "dmae", "braintus", "cerebro", "церебро", "gamer",
      "нервна система", "нервната система", "nervous system", "neuro", "невро", "умствен", "mental", "учене", "learning", "виногин",
      "vinogin", "гинкоприм", "селеган",
    ),
  ],
  [
    "san-i-stres",
    kw(
      "сън(?![^\\W_])", "съня", "sleep", "мелатонин", "melatonin", "безсъние", "insomnia", "стрес", "stress", "тревожн", "anxiety",
      "relax", "релакс", "успокоя", "calm", "спокоен", "спокойств", "валериана", "valerian", "маточина", "lemon balm", "пасифлора",
      "passiflora", "passion flower", "5-?htp", "настроение", "mood", "депрес", "нервност", "нервно напрежение", "раздразнителн",
      "gaba", "габа", "sam-?e", "same$", "serenesol", "zzz", "night time", "night formula", "лавандула", "lavender", "хмел", "hops",
      "лайка", "chamomile", "шафран", "saffron", "affron", "ashwagandha за сън", "умора и стрес", "burnout", "изтощение",
    ),
  ],
  [
    "cheren-drob",
    kw(
      "черен дроб", "черния дроб", "liver", "жлъчк", "жлъчен", "билиарн", "бял трън", "milk thistle", "silymarin", "силимарин",
      "артишок", "artichoke", "tudca", "хепато", "hepato", "hepa", "хепа", "холин и инозитол", "лив 52", "liv\\.? ?52",
      "есенциални фосфолипиди", "фосфолипиди", "phospholipid", "глухарче", "dandelion", "репей", "burdock", "пречистване",
      "detox liver", "liver detox", "бъбре", "kidney", "бъбрец",
    ),
  ],
  [
    "zrenie",
    kw(
      "зрение", "vision", "eye(?![^\\W_])", "eyes", "очи(?![^\\W_])", "очите", "лутеин", "lutein", "зеаксантин", "zeaxanthin",
      "черна боровинка", "bilberry", "eyebright", "очанка", "ocuvite", "окувит", "ретина", "retina", "макула", "macula",
    ),
  ],
  [
    "kravna-zahar",
    kw(
      "кръвна захар", "кръвната захар", "blood sugar", "глюкоза", "glucose", "инсулин", "insulin", "диабет", "diabet", "берберин",
      "berberin", "горчив пъпеш", "bitter melon", "гимнема", "gymnema", "метаболизъм", "metabolism", "метаболит", "glucose control",
      "gluco", "глюко(?!замин)", "цейлонска канела", "ceylon cinnamon", "cinnamon extract", "бананаба", "banaba", "щитовидн",
      "thyroid", "тироид",
    ),
  ],
  [
    "gabi",
    kw(
      "гъби(?![^\\W_])", "гъба(?![^\\W_])", "гъбен", "гъбено", "mushroom", "рейши", "reishi", "ганодерма", "ganoderma", "hericium",
      "херициум", "кордицепс", "cordyceps", "чага", "chaga", "шийтаке", "shiitake", "майтаке", "maitake", "турска опашка",
      "turkey tail", "coriolus", "кориолус", "trametes", "копринус", "coprinus", "полипорус", "polyporus", "агарикус", "agaricus",
      "tremella", "тремела", "аурикулария", "auricularia", "мицел", "mycel", "сенниковиден",
    ),
  ],
  [
    "adaptogeni",
    kw(
      "ашваганда", "ашвагандха", "ashwagandha", "ksm-?66", "sensoril", "родиола", "rhodiola", "златен корен", "женшен", "ginseng",
      "мака(?![^\\W_])", "maca(?![^\\W_])", "елеутерокок", "eleuther", "сибирски женшен", "шизандра", "schisandra", "левзея", "leuzea",
      "левзеа", "тулси", "tulsi", "свещен босилек", "holy basil", "шиладжит", "шилажит", "shilajit", "мумио", "адаптоген", "adaptogen",
      "астрагал", "astragal", "кодонопсис", "codonopsis", "мака и", "ashwa",
    ),
  ],
  [
    "bilkovi-chayove",
    kw(
      "чай(?![^\\W_])", "чайове", "tea(?![^\\W_])", "teas$", "herbal tea", "билков чай", "чаена смес", "матча", "matcha", "ройбос",
      "rooibos", "филтърни пакетчета", "tea bags", "чаени пакетчета", "инфузия", "infusion(?! solution)", "билкова смес за чай",
    ),
  ],
  [
    "tinkturi",
    kw(
      "тинктура", "tincture", "течен екстракт", "liquid extract", "билкови капки", "билков сироп", "herbal syrup", "сироп от",
      "сироп с", "\\d+\\s?(?:мл|ml)\\s?капки", "капки", "drops$", "екстракт в капки", "глицеринов екстракт", "glycerite",
      "алкохолен екстракт", "еликсир", "elixir", "сироп$", "syrup$", "балсам шведск", "шведска горчивка", "шведски билки",
      "swedish bitters",
    ),
  ],
  [
    "bilkovi-ekstrakti",
    kw(
      "куркума", "куркумин", "turmeric", "curcum", "джинджифил", "ginger", "канела", "cinnamon", "коприва", "nettle", "хвощ",
      "horsetail", "бял равнец", "yarrow", "жълт кантарион", "st\\.? john'?s wort", "hypericum", "лайка", "мента", "peppermint",
      "мащерка", "thyme", "риган", "oregano", "розмарин", "rosemary", "градински чай", "салвия", "sage(?![^\\W_])", "невен",
      "calendula", "липа", "бабин зъб", "черен орех", "black walnut", "пелин", "wormwood", "neem", "нийм", "ним(?![^\\W_])",
      "шатавари", "shatavari", "трифала", "triphala", "аюрвед", "ayurved", "гугул", "guggul", "амла", "amla", "мастикс",
      "mastic(?! gum$)", "mastic gum", "котешки нокът", "cat'?s claw", "алое", "aloe", "чесън", "garlic", "маслинов лист", "екстракт",
      "extract", "билк", "herb", "растителен", "корен(?![^\\W_])", "root(?![^\\W_])", "листа(?![^\\W_])", "leaf(?![^\\W_])", "цвят",
      "плод$", "fruit extract", "семе$", "кора$", "bark$", "гроздов", "сминдух", "fenugreek", "resin", "смола", "коренище", "стрък",
      "herba$", "folium", "radix", "fructus", "бяла върба", "white willow", "гарвански", "ехинацея", "нар$", "pomegranate",
      "грейпфрут", "grapefruit", "черен пипер", "black pepper", "пиперин", "piperin", "кайенски", "cayenne", "капсаицин", "capsaicin",
      "зелен чай екстракт", "green tea extract", "egcg", "кофеин от", "гуарана екстракт", "chlorophyll", "хлорофил", "бета-ситостерол",
      "beta-sitosterol", "фитостерол", "phytosterol", "бамбук", "bamboo", "арника", "arnica", "витекс", "босилек", "basil", "кимион",
      "cumin", "копър", "dill", "анасон", "anise", "кориандър", "coriander", "карамфил", "clove", "бадян", "женско биле", "licorice",
      "liquorice", "ружа", "бъз", "глог", "шипка",
    ),
  ],
];

export const HORMONAL_WEAK: [string, RegExp][] = [
  [
    "za-mazhe",
    kw("за мъже", "for men", "men'?s", "мъжк", "male(?![^\\W_])", "libido", "либидо", "потентност", "potency", "man$", "мъже$", "мъжете"),
  ],
  [
    "za-zheni",
    kw("за жени", "for women", "women'?s", "дамск", "female(?![^\\W_])", "женск", "жени$", "woman$", "lady", "лейди", "жената"),
  ],
];

export const KIDS = kw(
  "за деца", "детск", "деца(?![^\\W_])", "kids", "kid(?![^\\W_])", "children", "child(?![^\\W_])", "junior", "бебета",
  "бебе(?![^\\W_])", "бебешк", "toddler", "малчугани", "дечица", "animal parade", "bearies", "мечета", "kinder vit", "детски",
);

export const SUPP_FORM = kw(
  "капсул", "caps$", "capsule", "vcaps", "softgel", "софтгел", "таблетк", "tabs$", "tablets", "табл", "дражета", "каплети",
  "caplets", "gummies", "желирани", "дъвчащи", "сашета", "sachet", "стик", "прах$", "powder", "на прах", "капки", "drops", "сироп",
  "syrup", "ампули за пиене", "ампули", "течн", "liquid", "\\d+\\s?(?:mg|мг|mcg|мкг|µg|iu|ме)$", "дози", "servings", "serv\\.",
  "хранителна добавка", "food supplement", "dietary supplement", "добавка$", "екстракт", "extract", "веге", "vege", "лозенги",
  "пастили", "шот$", "shot$", "спрей за уста", "орален спрей", "oral spray",
);

export const LOOSE_STRONG = kw(
  "\\d+\\s?дози", "\\d+\\s?(?:капсули|таблетки|софтгел|дражета|caps|tabs|vcaps|softgels|gummies|таблетки за)",
  "хранителна добавка", "food supplement", "dietary supplement", "whey", "суроватъчен", "протеин(?!ова паста|ов хляб)", "protein",
  "креатин", "creatine", "bcaa", "eaa", "глутамин", "glutamine", "карнитин", "carnitine", "pre-?workout", "предтренировъчн",
  "мултивитамин", "multivitamin", "витамин[- ]?[a-zа-я]\\d*", "vitamin[- ]?[a-z]\\d*", "омега[- ]?3", "omega[- ]?3", "колаген",
  "collagen", "пробиотик", "probiotic", "магнезий", "magnesium", "ашваганда", "ashwagandha", "gainer", "гейнър", "fat burn",
  "фет бърнър", "електролит", "electrolyt",
);

export const PRICE_PROFILES: Record<string, PriceProfile> = {
  "surovatachen-protein": { min: 4.99, max: 99.99, perKg: 26, default: 34.99 },
  "protein-izolat": { min: 5.99, max: 119.99, perKg: 36, default: 44.99 },
  kazein: { min: 5.99, max: 99.99, perKg: 32, default: 39.99 },
  "rastitelen-protein": { min: 4.99, max: 79.99, perKg: 30, default: 29.99 },
  "drugi-proteini": { min: 5.99, max: 99.99, perKg: 32, default: 36.99 },
  geyneri: { min: 4.99, max: 99.99, perKg: 9, default: 34.99 },
  "zamestiteli-na-hrana": { min: 4.99, max: 79.99, perKg: 28, default: 29.99 },
  "kreatin-monohidrat": { min: 4.99, max: 69.99, perKg: 38, default: 19.99, perUnit: 0.06 },
  "kreatinovi-kompleksi": { min: 6.99, max: 69.99, perKg: 55, default: 24.99, perUnit: 0.08 },
  "bcaa": { min: 4.99, max: 69.99, perKg: 48, default: 24.99, perUnit: 0.05 },
  "eaa": { min: 5.99, max: 69.99, perKg: 58, default: 29.99, perUnit: 0.06 },
  "glutamin": { min: 4.99, max: 59.99, perKg: 40, default: 19.99, perUnit: 0.05 },
  "drugi-aminokiselini": { min: 4.99, max: 59.99, perKg: 55, default: 16.99, perUnit: 0.09 },
  "predtrenirovachni": { min: 4.99, max: 69.99, perKg: 85, default: 34.99, perUnit: 0.12 },
  "energia-i-kofein": { min: 1.49, max: 49.99, perKg: 30, default: 9.99, perUnit: 0.08, perL: 12 },
  "elektroliti-i-vaglehidrati": { min: 2.49, max: 59.99, perKg: 22, default: 17.99, perUnit: 0.06 },
  "l-karnitin": { min: 4.99, max: 49.99, perL: 30, default: 19.99, perUnit: 0.12 },
  "fet-barnari": { min: 7.99, max: 59.99, default: 27.99, perUnit: 0.25 },
  "apetit-i-blokeri": { min: 6.99, max: 49.99, default: 19.99, perUnit: 0.15 },
  "detoks": { min: 5.99, max: 44.99, default: 16.99, perUnit: 0.14 },
  "proteinovi-barove": { min: 0.99, max: 59.99, perKg: 28, default: 2.49 },
  "yadkovi-masla": { min: 2.99, max: 29.99, perKg: 14, default: 7.99 },
  "zakuska": { min: 1.99, max: 29.99, perKg: 9, default: 6.99 },
  "sirop-sosove-podsladiteli": { min: 1.99, max: 24.99, perKg: 12, perL: 12, default: 5.99 },
  "superhrani": { min: 3.99, max: 49.99, perKg: 45, default: 12.99, perUnit: 0.06 },
  "yadki-i-semena": { min: 1.99, max: 34.99, perKg: 22, default: 6.99 },
  "med-i-pchelni-produkti": { min: 5.99, max: 89.99, perKg: 35, default: 14.99 },
  "napitki": { min: 1.49, max: 34.99, perL: 8, perKg: 30, default: 3.99 },
  "bilkovi-chayove": { min: 2.49, max: 19.99, perKg: 70, default: 4.99, perUnit: 0.18 },
  "tinkturi": { min: 4.99, max: 39.99, perL: 180, default: 12.99 },
  "sheykari-i-butilki": { min: 3.99, max: 34.99, default: 9.99 }, "kolani-i-rakavitsi": { min: 7.99, max: 99.99, default: 24.99 },
  "fitnes-uredi": { min: 4.99, max: 99.99, default: 19.99 },
  "_capsules": { min: 4.99, max: 89.99, default: 16.99, perUnit: 0.13 },
};

