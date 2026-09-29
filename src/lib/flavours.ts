// Flavour names in both languages. The export spells flavours in English ("Cookies & Cream", "Vanilla Fusion") and in
// Bulgarian ("Бисквити с крем", "Ванилов сладолед"), often both inside one family. Every flavour gets ONE Bulgarian
// display form (so a family never shows "Banana cream" next to "Бананов крем") and an English form when it can be
// translated: whole phrases first, then word by word (English "Strawberry Cheesecake" → "Ягодов чийзкейк" with the
// adjective agreeing with the noun; Bulgarian "Бял шоколад с малини" → "White chocolate with raspberries").
// Pure — shared by the importer, the admin and the storefront (English fallback for flavours typed in the admin).

type Gender = "m" | "f" | "n" | "p";

/** A flavour noun: Bulgarian singular, gender, adjective forms (m|f|n|pl) when it can qualify another noun, plural. */
type Noun = { en: string; bg: string; g: Gender; adj?: string[]; bgPl?: string; enPl?: string; dish?: boolean };

// [english (| alternatives), bulgarian, gender, "adj m|f|n|pl" or "", "bg plural|en plural" or "", dish?]
// A "dish" is a base the other words describe (English "Strawberry Cheesecake" = "Ягодов чийзкейк"); two plain flavour
// nouns next to each other are a combination ("Strawberry Banana" = "Ягода и банан").
const NOUN_DATA: [string, string, Gender, string, string, boolean?][] = [
  ["chocolate|choco|choc|chocolat", "шоколад", "m", "шоколадов|шоколадова|шоколадово|шоколадови", ""],
  ["vanilla|vanila|vanille", "ванилия", "f", "ванилов|ванилова|ванилово|ванилови", ""],
  ["strawberry|strawberries", "ягода", "f", "ягодов|ягодова|ягодово|ягодови", "ягоди|strawberries"],
  ["raspberry|raspberries|rasperry|razz", "малина", "f", "малинов|малинова|малиново|малинови", "малини|raspberries"],
  ["blueberry|blueberries", "боровинка", "f", "боровинков|боровинкова|боровинково|боровинкови", "боровинки|blueberries"],
  ["cranberry|cranberries", "червена боровинка", "f", "", "червени боровинки|cranberries"],
  ["blackberry|blackberries", "къпина", "f", "къпинов|къпинова|къпиново|къпинови", "къпини|blackberries"],
  ["cherry|cherries", "череша", "f", "черешов|черешова|черешово|черешови", "череши|cherries"],
  ["sour cherry|morello cherry", "вишна", "f", "вишнев|вишнева|вишнево|вишневи", "вишни|sour cherries"],
  ["lemon|lemons", "лимон", "m", "лимонов|лимонова|лимоново|лимонови", "лимони|lemons"],
  ["lime|limes", "лайм", "m", "лаймов|лаймова|лаймово|лаймови", ""],
  ["orange|oranges", "портокал", "m", "портокалов|портокалова|портокалово|портокалови", "портокали|oranges"],
  ["blood orange|red orange", "червен портокал", "m", "", ""],
  ["tangerine|mandarin", "мандарина", "f", "мандаринов|мандаринова|мандариново|мандаринови", "мандарини|tangerines"],
  ["grapefruit", "грейпфрут", "m", "грейпфрутов|грейпфрутова|грейпфрутово|грейпфрутови", ""],
  ["peach|peaches", "праскова", "f", "прасковен|прасковена|прасковено|прасковени", "праскови|peaches"],
  ["apricot|apricots", "кайсия", "f", "кайсиев|кайсиева|кайсиево|кайсиеви", "кайсии|apricots"],
  ["apple|apples", "ябълка", "f", "ябълков|ябълкова|ябълково|ябълкови", "ябълки|apples"],
  ["pear|pears", "круша", "f", "крушов|крушова|крушово|крушови", "круши|pears"],
  ["plum|plums", "слива", "f", "сливов|сливова|сливово|сливови", "сливи|plums"],
  ["fig|figs", "смокиня", "f", "смокинов|смокинова|смокиново|смокинови", "смокини|figs"],
  ["grape|grapes", "грозде", "n", "гроздов|гроздова|гроздово|гроздови", ""],
  ["watermelon", "диня", "f", "динен|динена|динено|динени", ""],
  ["melon", "пъпеш", "m", "пъпешов|пъпешова|пъпешово|пъпешови", ""],
  ["mango", "манго", "n", "", ""],
  ["pineapple", "ананас", "m", "ананасов|ананасова|ананасово|ананасови", ""],
  ["banana|bananas", "банан", "m", "бананов|бананова|бананово|бананови", "банани|bananas"],
  ["coconut", "кокос", "m", "кокосов|кокосова|кокосово|кокосови", ""],
  ["kiwi", "киви", "n", "", ""],
  ["lychee|litchi", "личи", "n", "", ""],
  ["papaya", "папая", "f", "", ""],
  ["guava", "гуава", "f", "", ""],
  ["passion fruit|passionfruit|passion|maracuja", "маракуя", "f", "", ""],
  ["dragon fruit|dragonfruit|pitaya", "драконов плод", "m", "", ""],
  ["pomegranate", "нар", "m", "", ""],
  ["blackcurrant|black currant|cassis", "касис", "m", "", ""],
  ["redcurrant|red currant", "червено френско грозде", "n", "", ""],
  ["cactus", "кактус", "m", "", ""],
  ["elderflower|elderberry", "бъз", "m", "", ""],
  ["yuzu", "юзу", "n", "", ""],
  ["nectarine", "нектарина", "f", "", ""],
  ["acai|açaí", "асаи", "n", "", ""],
  ["goji|goji berry", "годжи бери", "n", "", ""],
  ["aloe|aloe vera", "алое вера", "n", "", ""],
  ["pumpkin", "тиква", "f", "тиквен|тиквена|тиквено|тиквени", ""],
  ["carrot", "морков", "m", "морковен|морковена|морковено|морковени", ""],
  ["tomato", "домат", "m", "доматен|доматена|доматено|доматени", ""],
  ["cucumber", "краставица", "f", "", ""],
  ["fruit|fruits|fruity|berry|berries", "плодове", "p", "плодов|плодова|плодово|плодови", ""],
  ["forest fruits|forest fruit|forest berries|wild berries|wild berry|mixed berries|mixed berry|wildberry|wildberries|forest berry", "горски плодове", "p", "", ""],
  ["red fruits|red berries|red fruit", "червени плодове", "p", "", ""],
  ["tropical fruits|tropical fruit|tropical", "тропически плодове", "p", "", ""],
  ["exotic fruits|exotic fruit|exotic", "екзотични плодове", "p", "", ""],
  ["summer fruits|summer fruit", "летни плодове", "p", "", ""],
  ["multifruit|multi fruit|mixed fruit|mixed fruits|fruit mix|tutti frutti|tutti-frutti", "мултифрут", "m", "", ""],
  ["citrus|citrus fruits", "цитрус", "m", "цитрусов|цитрусова|цитрусово|цитрусови", ""],
  ["mint|peppermint|spearmint", "мента", "f", "ментов|ментова|ментово|ментови", ""],
  ["cinnamon", "канела", "f", "канелен|канелена|канелено|канелени", ""],
  ["ginger", "джинджифил", "m", "джинджифилов|джинджифилова|джинджифилово|джинджифилови", ""],
  ["honey", "мед", "m", "меден|медена|медено|медени", ""],
  ["caramel|carmel", "карамел", "m", "карамелов|карамелова|карамелово|карамелови", ""],
  ["salted caramel|salty caramel", "солен карамел", "m", "", ""],
  ["toffee", "тофи", "n", "", ""],
  ["fudge", "фъдж", "m", "", "", true],
  ["hazelnut|hazelnuts", "лешник", "m", "лешников|лешникова|лешниково|лешникови", "лешници|hazelnuts"],
  ["almond|almonds", "бадем", "m", "бадемов|бадемова|бадемово|бадемови", "бадеми|almonds"],
  ["walnut|walnuts", "орех", "m", "орехов|орехова|орехово|орехови", "орехи|walnuts"],
  ["pistachio|pistachios|pistacchio", "шамфъстък", "m", "шамфъстъков|шамфъстъкова|шамфъстъково|шамфъстъкови", "шамфъстъци|pistachios"],
  ["peanut|peanuts", "фъстък", "m", "фъстъчен|фъстъчена|фъстъчено|фъстъчени", "фъстъци|peanuts"],
  ["peanut butter|peanut buter|pb", "фъстъчено масло", "n", "", ""],
  ["nuts|nut", "ядки", "p", "ядков|ядкова|ядково|ядкови", ""],
  ["coffee|caffe|cafe", "кафе", "n", "", ""],
  ["cappuccino|capuccino|cappucino", "капучино", "n", "", ""],
  ["latte|caffe latte|cafe latte", "лате", "n", "", ""],
  ["mocha|moca|mocca|mokka", "мока", "f", "", ""],
  ["espresso", "еспресо", "n", "", ""],
  ["frappe|frappé", "фрапе", "n", "", ""],
  ["macchiato|latte macchiato", "лате макиато", "n", "", ""],
  ["tea", "чай", "m", "", "", true],
  ["green tea", "зелен чай", "m", "", ""],
  ["iced tea|ice tea|icetea|cold tea", "студен чай", "m", "", "", true],
  ["matcha", "матча", "f", "", ""],
  ["cocoa|cacao", "какао", "n", "какаов|какаова|какаово|какаови", ""],
  ["cola|coke", "кола", "f", "", "", true],
  ["cherry cola", "чери кола", "f", "", ""],
  ["lemonade|limonade", "лимонада", "f", "", "", true],
  ["limeade", "лаймова лимонада", "f", "", ""],
  ["punch", "пунш", "m", "", "", true],
  ["fruit punch", "плодов пунш", "m", "", ""],
  ["smoothie", "смути", "n", "", "", true],
  ["shake|shakes", "шейк", "m", "", "", true],
  ["milkshake|milk shake", "млечен шейк", "m", "", "", true],
  ["cheesecake|cheese cake", "чийзкейк", "m", "", "", true],
  ["ice cream|icecream|gelato", "сладолед", "m", "", "", true],
  ["cream|creme|crème", "крем", "m", "", "", true],
  ["yogurt|yoghurt|yogourt|yoghourt", "йогурт", "m", "", "", true],
  ["pie", "пай", "m", "", "", true],
  ["cake|cakes", "торта", "f", "", "", true],
  ["birthday cake", "торта за рожден ден", "f", "", ""],
  ["cookie|cookies|biscuit|biscuits|bisquit", "бисквита", "f", "", "бисквити|cookies", true],
  ["cookies and cream|cookies & cream|cookies n cream|cookies'n'cream|cookie cream|cookies cream|cookie and cream", "бисквита с крем", "f", "", ""],
  ["brownie|brownies", "брауни", "n", "", "", true],
  ["muffin|muffins", "мъфин", "m", "", "", true],
  ["cupcake", "кексче", "n", "", "", true],
  ["wafer|waffle|waffles|wafers", "вафла", "f", "", "", true],
  ["pancake|pancakes", "палачинка", "f", "", "", true],
  ["donut|doughnut", "поничка", "f", "", "", true],
  ["candy|candies|sweets", "бонбони", "p", "", "", true],
  ["bubble gum|bubblegum|gum", "дъвка", "f", "", ""],
  ["cotton candy|candy floss", "захарен памук", "m", "", ""],
  ["mojito", "мохито", "n", "", "", true],
  ["pina colada|piña colada|pinacolada|pina-colada", "пина колада", "f", "", ""],
  ["margarita", "маргарита", "f", "", "", true],
  ["milk", "мляко", "n", "млечен|млечна|млечно|млечни", ""],
  ["butter", "масло", "n", "маслен|маслена|маслено|маслени", ""],
  ["custard|vanilla custard", "ванилов крем", "m", "", ""],
  ["nougat", "нуга", "f", "", ""],
  ["praline|pralines", "пралина", "f", "", ""],
  ["marzipan", "марципан", "m", "", ""],
  ["tiramisu", "тирамису", "n", "", ""],
  ["creme brulee|crème brûlée|creme brûlée", "крем брюле", "n", "", ""],
  ["rum", "ром", "m", "", ""],
  ["mascarpone", "маскарпоне", "n", "", ""],
  ["cheese", "сирене", "n", "", ""],
  ["salt", "сол", "f", "", ""],
  ["caramel latte", "карамелено лате", "n", "", ""],
  ["chai|chai latte", "чай лате", "n", "", ""],
  ["energy|energy drink", "енергийна напитка", "f", "", ""],
  ["tonic|tonic water", "тоник", "m", "", ""],
  ["gingerbread", "меденка", "f", "", ""],
  ["oreo", "Орео", "n", "", ""],
];

/** English adjectives → Bulgarian forms (m|f|n|pl). */
const ADJ_DATA: [string, string][] = [
  ["white", "бял|бяла|бяло|бели"],
  ["black", "черен|черна|черно|черни"],
  ["dark", "тъмен|тъмна|тъмно|тъмни"],
  ["double", "двоен|двойна|двойно|двойни"],
  ["triple", "троен|тройна|тройно|тройни"],
  ["salted|salty", "солен|солена|солено|солени"],
  ["sweet", "сладък|сладка|сладко|сладки"],
  ["sour", "кисел|кисела|кисело|кисели"],
  ["iced|ice|icy|frozen|freeze", "леден|ледена|ледено|ледени"],
  ["cold|chilled", "студен|студена|студено|студени"],
  ["green", "зелен|зелена|зелено|зелени"],
  ["red", "червен|червена|червено|червени"],
  ["blue", "син|синя|синьо|сини"],
  ["pink", "розов|розова|розово|розови"],
  ["yellow", "жълт|жълта|жълто|жълти"],
  ["purple", "лилав|лилава|лилаво|лилави"],
  ["grey|gray", "сив|сива|сиво|сиви"],
  ["brown", "кафяв|кафява|кафяво|кафяви"],
  ["exotic", "екзотичен|екзотична|екзотично|екзотични"],
  ["wild", "див|дива|диво|диви"],
  ["forest", "горски|горска|горско|горски"],
  ["french", "френски|френска|френско|френски"],
  ["belgian", "белгийски|белгийска|белгийско|белгийски"],
  ["swiss", "швейцарски|швейцарска|швейцарско|швейцарски"],
  ["fresh", "свеж|свежа|свежо|свежи"],
  ["crunchy|crispy", "хрупкав|хрупкава|хрупкаво|хрупкави"],
  ["creamy", "кремообразен|кремообразна|кремообразно|кремообразни"],
  ["spicy|hot", "пикантен|пикантна|пикантно|пикантни"],
  ["baked|roasted", "печен|печена|печено|печени"],
  ["toasted", "препечен|препечена|препечено|препечени"],
  ["natural", "натурален|натурална|натурално|натурални"],
  ["golden", "златен|златна|златно|златни"],
  ["summer", "летен|лятна|лятно|летни"],
  ["winter", "зимен|зимна|зимно|зимни"],
  ["dubai|dubai style", "дубайски|дубайска|дубайско|дубайски"],
  ["caribbean", "карибски|карибска|карибско|карибски"],
  ["sicilian", "сицилиански|сицилианска|сицилианско|сицилиански"],
  ["bourbon", "бурбън|бурбън|бурбън|бурбън"],
  ["italian", "италиански|италианска|италианско|италиански"],
  ["neapolitan", "неаполитански|неаполитанска|неаполитанско|неаполитански"],
  ["homemade", "домашен|домашна|домашно|домашни"],
  ["mixed", "смесен|смесена|смесено|смесени"],
  ["bitter", "горчив|горчива|горчиво|горчиви"],
];

/** Marketing words that carry no flavour ("Vanilla Fusion", "Deluxe Chocolate Shake", "Watermelon Flavor"). */
const FILLER = new Set([
  "fusion", "rich", "flavour", "flavor", "flavoured", "flavored", "flavors", "flavours", "taste", "delight", "deluxe", "supreme",
  "premium", "classic", "original", "smooth", "delicious", "yummy", "ultimate", "style", "very", "real", "extra", "intense", "new",
  "juicy", "tasty", "authentic", "pure", "true", "super", "mega", "royal", "vkus",
]);

/** Whole phrases (normalised key → Bulgarian, English). Checked before the word-by-word translation. */
const PHRASES: [string, string, string][] = [
  ["unflavored|unflavoured|unflavourd|no flavour|no flavor|flavourless|neutral|plain|без вкус|неовкусен|неовкусена|неовкусено|без аромат|natural flavour|natural", "Неовкусен", "Unflavoured"],
  ["натурален|натурална|натурално", "Натурален", "Natural"],
  ["dark chocolate|черен шоколад|тъмен шоколад", "Черен шоколад", "Dark chocolate"],
  ["milk chocolate|млечен шоколад", "Млечен шоколад", "Milk chocolate"],
  ["white chocolate|white choco|бял шоколад", "Бял шоколад", "White chocolate"],
  ["double chocolate|double choco|двоен шоколад", "Двоен шоколад", "Double chocolate"],
  ["triple chocolate|троен шоколад", "Троен шоколад", "Triple chocolate"],
  ["double dutch chocolate", "Двоен холандски шоколад", "Double Dutch chocolate"],
  ["cookies and cream|cookies & cream|cookie cream|бисквита с крем|бисквити с крем|бисквитки с крем|бисквити и крем|бисквити и сметана|бисквитки със сметана|бисквита със сметана|бисквити със сметана|бисквитка с крем|бисквитки и крем", "Бисквита с крем", "Cookies & cream"],
  ["peanut butter|фъстъчено масло|фъстъчен крем", "Фъстъчено масло", "Peanut butter"],
  ["forest fruits|forest fruit|wild berries|wild berry|forest berries|mixed berries|горски плодове|горски плод", "Горски плодове", "Forest fruits"],
  ["tropical|tropical fruits|tropical fruit|тропически плодове|тропикал|тропик", "Тропически плодове", "Tropical fruits"],
  ["exotic fruits|exotic|екзотични плодове", "Екзотични плодове", "Exotic fruits"],
  ["fruit punch|плодов пунш", "Плодов пунш", "Fruit punch"],
  ["tropical punch|тропически пунш", "Тропически пунш", "Tropical punch"],
  ["blue raspberry|blue razz|синя малина", "Синя малина", "Blue raspberry"],
  ["blueberry|синя боровинка|боровинка", "Боровинка", "Blueberry"],
  ["green apple|зелена ябълка", "Зелена ябълка", "Green apple"],
  ["sour apple|кисела ябълка", "Кисела ябълка", "Sour apple"],
  ["red orange|blood orange|червен портокал", "Червен портокал", "Blood orange"],
  ["salted caramel|солен карамел", "Солен карамел", "Salted caramel"],
  ["lemon lime|lemon and lime|лимон и лайм|лимон-лайм|лимон лайм", "Лимон и лайм", "Lemon & lime"],
  ["iced tea|ice tea|студен чай", "Студен чай", "Iced tea"],
  ["ice tea peach|iced tea peach|peach ice tea|peach iced tea|cold peach tea|студен чай праскова|студен чай с праскова", "Студен чай с праскова", "Peach iced tea"],
  ["ice tea lemon|iced tea lemon|lemon ice tea|lemon iced tea|ice tea with lemon|студен чай лимон|студен чай с лимон", "Студен чай с лимон", "Lemon iced tea"],
  ["energy|energy drink|енергийна напитка", "Енергийна напитка", "Energy drink"],
  ["bubble gum|bubblegum|дъвка", "Дъвка", "Bubble gum"],
  ["cotton candy|захарен памук", "Захарен памук", "Cotton candy"],
  ["pina colada|piña colada|pinacolada|пина колада|пинаколада|пиня колада", "Пина колада", "Piña colada"],
  ["cinnamon roll|канелено руло", "Канелено руло", "Cinnamon roll"],
  ["birthday cake|торта за рожден ден|рожден ден", "Торта за рожден ден", "Birthday cake"],
  ["cherry cola|чери кола|черешова кола", "Чери кола", "Cherry cola"],
  ["coca cola|coca-cola|кока кола|кока-кола", "Кола", "Cola"],
  ["french vanilla|френска ванилия", "Френска ванилия", "French vanilla"],
  ["passion fruit|passionfruit|маракуя", "Маракуя", "Passion fruit"],
  ["creme brulee|crème brûlée|крем брюле", "Крем брюле", "Crème brûlée"],
  ["shamfastak|шам фъстък|шамфъстък|pistachio|pistachios", "Шамфъстък", "Pistachio"],
  ["sour cherry|вишна", "Вишна", "Sour cherry"],
  ["cranberry|cranberries|червена боровинка", "Червена боровинка", "Cranberry"],
  ["coffee frappe|кафе фрапе|кафе-фрапе", "Кафе фрапе", "Coffee frappé"],
  ["caffe latte|cafe latte|coffee latte|кафе лате|кафе - лате", "Кафе лате", "Caffè latte"],
  ["ice coffee|iced coffee|ледено кафе|студено кафе", "Ледено кафе", "Iced coffee"],
  ["mocha cappuccino|mocha - cappuccino|mocha capuccino|mocha - capuccino|moca capuccino|мока капучино", "Мока капучино", "Mocha cappuccino"],
  ["apple pie|ябълков пай", "Ябълков пай", "Apple pie"],
  ["apple cinnamon|apple and cinnamon|cinnamon and apple|apples with cinnamon|apple with cinnamon|ябълка с канела|ябълки с канела|ябълка и канела|канела и ябълка", "Ябълка с канела", "Apple & cinnamon"],
  ["strawberry banana|strawberry and banana|strawberry & banana|ягода и банан|ягода с банан|ягода-банан", "Ягода и банан", "Strawberry & banana"],
  ["chocolate peanut butter|chocolate and peanut butter|peanut butter chocolate|peanut butter with chocolate|шоколад и фъстъчено масло|шоколад с фъстъчено масло|фъстъчено масло с шоколад|фъстъчено масло и шоколад", "Шоколад и фъстъчено масло", "Chocolate & peanut butter"],
  ["chocolate hazelnut|chocolate and hazelnut|chocolate & hazelnut|шоколад и лешник|шоколад с лешник|шоколад с лешници|шоколад и лешници|шоколад-лешник", "Шоколад и лешник", "Chocolate & hazelnut"],
  ["chocolate coconut|chocolate and coconut|choco & coconut|choco coconut|coconut chocolate|шоколад и кокос|шоколад с кокос|кокос и шоколад|кокос с шоколад|шоколад - кокос", "Шоколад и кокос", "Chocolate & coconut"],
  ["chocolate caramel|chocolate and caramel|шоколад и карамел|шоколад с карамел|карамел и шоколад", "Шоколад и карамел", "Chocolate & caramel"],
  ["chocolate banana|chocolate and banana|шоколад и банан|шоколад с банан|шоколад - банан|банан и шоколад", "Шоколад и банан", "Chocolate & banana"],
  ["chocolate mint|chocolate and mint|шоколад и мента|шоколад с мента|мента и шоколад", "Шоколад и мента", "Chocolate & mint"],
  ["chocolate orange|chocolate and orange|шоколад и портокал|шоколад с портокал", "Шоколад и портокал", "Chocolate & orange"],
  ["chocolate cherry|chocolate and cherry|шоколад и череша|шоколад с череша|шоколад с череши", "Шоколад и череша", "Chocolate & cherry"],
  ["mango passion fruit|mango and passion fruit|mango & passion fruit|манго и маракуя|манго с маракуя", "Манго и маракуя", "Mango & passion fruit"],
  ["orange mango|orange and mango|mango orange|портокал и манго|портокал-манго|портокал - манго|портокал с манго|манго и портокал", "Портокал и манго", "Orange & mango"],
  ["pineapple mango|pineapple - mango|pineapple and mango|pineapple & mango|mango pineapple|ананас и манго|манго и ананас|манго с ананас|ананас с манго", "Ананас и манго", "Pineapple & mango"],
  ["peach mango|peach - mango|peach and mango|peach & mango|праскова и манго|праскова - манго|праскова с манго|манго и праскова|манго с праскова", "Праскова и манго", "Peach & mango"],
  ["raspberry strawberry|strawberry raspberry|малина и ягода|ягода и малина|ягода с малина|малина с ягода", "Малина и ягода", "Raspberry & strawberry"],
  ["strawberry kiwi|strawberry and kiwi|ягода и киви|ягода с киви|ягода-киви", "Ягода и киви", "Strawberry & kiwi"],
  ["strawberry watermelon|ягода и диня|ягода с диня", "Ягода и диня", "Strawberry & watermelon"],
  ["cherry apple|apple cherry|череша и ябълка|ябълка и череша|ябълка-череша|ябълка с череша|череша с ябълка", "Ябълка и череша", "Apple & cherry"],
  ["apple pear|apple - pear|pear apple|ябълка и круша|круша и ябълка|круша с ябълка|ябълка с круша|круша - ябълка", "Ябълка и круша", "Apple & pear"],
  ["lemon mint|lemon and mint|лимон и мента|лимон с мента", "Лимон и мента", "Lemon & mint"],
  ["orange lemon|orange and lemon|портокал и лимон|портокал - лимон|портокал с лимон", "Портокал и лимон", "Orange & lemon"],
  ["mango lemon|mango and lemon|манго с лимон|манго и лимон", "Манго и лимон", "Mango & lemon"],
  ["citrus peach|цитрус - праскова|цитрус и праскова|цитрус с праскова", "Цитрус и праскова", "Citrus & peach"],
  ["white chocolate raspberry|white chocolate and raspberry|бял шоколад с малина|бял шоколад с малини|бял шоколад и малина|бял шоколад-малина", "Бял шоколад с малина", "White chocolate & raspberry"],
  ["white chocolate coconut|white chocolate and coconut|бял шоколад с кокос|бял шоколад и кокос", "Бял шоколад с кокос", "White chocolate & coconut"],
  ["strawberry white chocolate|strawberry - white chocolate|бял шоколад с ягода|бял шоколад с ягоди|ягода и бял шоколад", "Бял шоколад с ягода", "White chocolate & strawberry"],
  ["chocolate cookies|chocolate cookie|шоколад с бисквити|шоколад и бисквити|шоколад и бисквитки|шоколадова бисквита", "Шоколад с бисквити", "Chocolate cookie"],
  ["cookies caramel|cookie caramel|бисквити с карамел", "Бисквити с карамел", "Caramel cookie"],
  ["vanilla ice cream|ванилов сладолед", "Ванилов сладолед", "Vanilla ice cream"],
  ["chocolate ice cream|шоколадов сладолед", "Шоколадов сладолед", "Chocolate ice cream"],
  ["strawberry ice cream|ягодов сладолед", "Ягодов сладолед", "Strawberry ice cream"],
  ["neapolitan|neapolitan ice cream|неаполитански сладолед", "Неаполитански сладолед", "Neapolitan ice cream"],
  ["chocolate brownie|шоколадово брауни", "Шоколадово брауни", "Chocolate brownie"],
  ["chocolate fudge|шоколадов фъдж", "Шоколадов фъдж", "Chocolate fudge"],
  ["strawberry cheesecake|ягодов чийзкейк", "Ягодов чийзкейк", "Strawberry cheesecake"],
  ["lemon cheesecake|лимонов чийзкейк", "Лимонов чийзкейк", "Lemon cheesecake"],
  ["pink lemonade|розова лимонада", "Розова лимонада", "Pink lemonade"],
  ["strawberry lemonade|ягодова лимонада", "Ягодова лимонада", "Strawberry lemonade"],
  ["cherry lemonade|черешова лимонада", "Черешова лимонада", "Cherry lemonade"],
  ["raspberry lemonade|малинова лимонада", "Малинова лимонада", "Raspberry lemonade"],
  ["blueberry muffin|боровинково кексче|боровинков мъфин", "Боровинков мъфин", "Blueberry muffin"],
  ["dubai chocolate|dubai style chocolate|дубайски шоколад", "Дубайски шоколад", "Dubai chocolate"],
  ["snickers|сникърс", "Сникърс", "Snickers"],
  ["bounty|баунти", "Баунти", "Bounty"],
  ["kinder bueno|киндер буено", "Киндер буено", "Kinder Bueno"],
  ["toffifee|tofifee|тофифи", "Тофифи", "Toffifee"],
  ["grape|grapes|грозде", "Грозде", "Grape"],
  ["blue grape|синьо грозде", "Синьо грозде", "Blue grape"],
  ["sour watermelon|кисела диня", "Кисела диня", "Sour watermelon"],
  ["pink grapefruit|розов грейпфрут", "Розов грейпфрут", "Pink grapefruit"],
  ["mojito|мохито", "Мохито", "Mojito"],
  ["raspberry mojito|малиново мохито", "Малиново мохито", "Raspberry mojito"],
  ["tutti frutti|tutti-frutti|тути фрути|тути-фрути", "Тути фрути", "Tutti frutti"],
  ["candy|бонбони|бонбон", "Бонбони", "Candy"],
  ["cereal milk", "Мляко със зърнена закуска", "Cereal milk"],
  ["vanilla bean|vanilla pod", "Ванилия", "Vanilla"],
  ["bourbon vanilla|бурбън ванилия", "Бурбън ванилия", "Bourbon vanilla"],
  ["hazelnut cream|лешников крем|крем ноазет|noisette", "Лешников крем", "Hazelnut cream"],
  ["coconut cream|кокосов крем", "Кокосов крем", "Coconut cream"],
  ["banana cream|бананов крем", "Бананов крем", "Banana cream"],
  ["strawberry cream|ягодов крем", "Ягодов крем", "Strawberry cream"],
  ["vanilla cream|ванилов крем|ванилия-крем|ванилия крем", "Ванилов крем", "Vanilla cream"],
  ["nougat cream|нуга крем", "Нуга крем", "Nougat cream"],
  ["coconut milk|кокосово мляко", "Кокосово мляко", "Coconut milk"],
  ["ice cola|ледена кола", "Ледена кола", "Iced cola"],
  ["lemon tea|чай с лимон", "Чай с лимон", "Lemon tea"],
  ["peach tea|чай с праскова|прасковен чай", "Чай с праскова", "Peach tea"],
  ["matcha tea|матча чай", "Матча", "Matcha"],
  ["multifruit|multi fruit|мултифрут|мултиплод|плодов микс|fruit mix|mixed fruit", "Мултифрут", "Multifruit"],
  ["red fruits|red berries|червени плодове", "Червени плодове", "Red berries"],
];

// ---------------------------------------------------------------------------
// Indexes

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFC")
    .replace(/ё/g, "е")
    .replace(/[’'`´]n[’'`´]/g, " and ")
    .replace(/\s+n\s+/g, " and ")
    .replace(/&/g, " and ")
    .replace(/\+/g, " and ")
    .replace(/[“”"«»()[\]!?.:;*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Phrase key: norm + separators ("-", "/", ",") read as "and", Bulgarian "и" as "and" too. */
const phraseKey = (s: string) =>
  norm(s)
    .replace(/\s*[-/,|]\s*/g, " and ")
    .replace(/(^|\s)и(?=\s|$)/g, "$1and")
    .replace(/\s+/g, " ")
    .trim();

type Entry = { bg: string; en: string };
const PHRASE_INDEX = new Map<string, Entry>();
for (const [keys, bg, en] of PHRASES) for (const k of keys.split("|")) if (!PHRASE_INDEX.has(phraseKey(k))) PHRASE_INDEX.set(phraseKey(k), { bg, en });

type Lex = { kind: "noun"; n: Noun; plural: boolean } | { kind: "adj"; forms: string[]; en: string } | { kind: "filler" };
const EN_LEX = new Map<string, Lex>();
const NOUNS: Noun[] = [];
for (const [ens, bg, g, adj, pl, dish] of NOUN_DATA) {
  const [bgPl, enPl] = pl ? pl.split("|") : [undefined, undefined];
  const alts = ens.split("|");
  const n: Noun = { en: alts[0], bg, g, adj: adj ? adj.split("|") : undefined, bgPl, enPl, dish: !!dish };
  NOUNS.push(n);
  for (const e of alts) {
    const plural = !!bgPl && (e === enPl || (e.endsWith("s") && !alts[0].endsWith("s")));
    if (!EN_LEX.has(norm(e))) EN_LEX.set(norm(e), { kind: "noun", n, plural });
  }
}
for (const [ens, forms] of ADJ_DATA) {
  for (const e of ens.split("|")) if (!EN_LEX.has(norm(e))) EN_LEX.set(norm(e), { kind: "adj", forms: forms.split("|"), en: ens.split("|")[0] });
}
for (const f of FILLER) if (!EN_LEX.has(f)) EN_LEX.set(f, { kind: "filler" });
const EN_MAX_WORDS = Math.max(...[...EN_LEX.keys()].map((k) => k.split(" ").length));

/** Bulgarian word forms → English word (+ whether it is a noun plural). */
type BgLex = { en: string; noun: boolean };
const BG_LEX = new Map<string, BgLex>();
const addBg = (form: string, en: string, noun: boolean) => {
  const k = norm(form);
  if (k && !BG_LEX.has(k)) BG_LEX.set(k, { en, noun });
};
for (const n of NOUNS) {
  addBg(n.bg, n.en, true);
  if (n.bgPl) addBg(n.bgPl, n.enPl ?? n.en, true);
  for (const a of n.adj ?? []) addBg(a, n.en, false);
}
for (const [ens, forms] of ADJ_DATA) for (const f of forms.split("|")) addBg(f, ens.split("|")[0], false);
// Extra Bulgarian spellings and forms seen in the export.
const BG_EXTRA: [string, string][] = [
  ["бисквитки", "cookies"], ["бисквитка", "cookie"], ["бисквити", "cookies"], ["вафли", "wafers"], ["ядки", "nuts"], ["ядка", "nut"],
  ["сметана", "cream"], ["крема", "cream"], ["кексче", "muffin"], ["кекс", "cake"], ["торта", "cake"], ["шейк", "shake"], ["смути", "smoothie"],
  ["лимонада", "lemonade"], ["пунш", "punch"], ["чай", "tea"], ["мляко", "milk"], ["кафе", "coffee"], ["лате", "latte"], ["капучино", "cappuccino"],
  ["фрапучино", "frappuccino"], ["мока", "mocha"], ["какао", "cocoa"], ["плод", "fruit"], ["плодове", "fruits"], ["горски", "forest"],
  ["парченца", "pieces"], ["захар", "sugar"], ["сол", "salt"], ["солен", "salted"], ["маргарита", "margarita"], ["мохито", "mojito"],
  ["шам фъстък", "pistachio"], ["фъстъци", "peanuts"], ["лешници", "hazelnuts"], ["бадеми", "almonds"], ["орехи", "walnuts"], ["скир", "skyr"],
  ["чийзкейк", "cheesecake"], ["брауни", "brownie"], ["сладолед", "ice cream"], ["йогурт", "yogurt"], ["крем", "cream"], ["пай", "pie"],
  ["фъдж", "fudge"], ["тофи", "toffee"], ["нуга", "nougat"], ["карамелов", "caramel"], ["ванилов", "vanilla"], ["мед", "honey"],
  ["печена", "baked"], ["печен", "baked"], ["палачинка", "pancake"], ["палачинки", "pancakes"], ["блонди", "blondie"], ["маскарпоне", "mascarpone"],
  ["кола", "cola"], ["тоник", "tonic"], ["ром", "rum"], ["гуава", "guava"], ["папая", "papaya"], ["киви", "kiwi"], ["личи", "lychee"],
  ["манго", "mango"], ["маракуя", "passion fruit"], ["нар", "pomegranate"], ["касис", "blackcurrant"], ["кактус", "cactus"], ["бъз", "elderflower"],
  ["матча", "matcha"], ["чили", "chili"], ["мента", "mint"], ["дубайски", "Dubai"], ["неаполитански", "Neapolitan"], ["тропически", "tropical"],
  ["тропическа", "tropical"], ["тропическо", "tropical"], ["екзотични", "exotic"], ["екзотичен", "exotic"], ["летни", "summer"], ["дива", "wild"],
  ["див", "wild"], ["свеж", "fresh"], ["свежа", "fresh"], ["свежи", "fresh"], ["ледена", "iced"], ["леден", "iced"], ["ледено", "iced"],
  ["студен", "iced"], ["студена", "iced"], ["студено", "iced"], ["сладък", "sweet"], ["сладка", "sweet"], ["сладко", "sweet"], ["млечен", "milk"],
  ["млечна", "milk"], ["млечно", "milk"], ["бяла", "white"], ["бял", "white"], ["бяло", "white"], ["черен", "dark"], ["черна", "black"],
  ["тъмен", "dark"], ["тъмна", "dark"], ["двоен", "double"], ["двойна", "double"], ["двойно", "double"], ["троен", "triple"], ["тройна", "triple"],
  ["натурален", "natural"], ["натурална", "natural"], ["натурално", "natural"], ["лаймова", "lime"], ["лаймов", "lime"], ["лимонов", "lemon"],
  ["лимонова", "lemon"], ["ментова", "mint"], ["ментов", "mint"], ["канелена", "cinnamon"], ["канелено", "cinnamon"], ["какаов", "cocoa"],
  ["руло", "roll"], ["крем брюле", "crème brûlée"], ["меденка", "gingerbread"], ["тирамису", "tiramisu"], ["марципан", "marzipan"],
  ["пралина", "praline"], ["пралини", "pralines"], ["бонбони", "candy"], ["бонбон", "candy"], ["дъвка", "bubble gum"], ["захарен памук", "cotton candy"],
  ["орео", "Oreo"], ["сирене", "cheese"], ["чери", "cherry"], ["кайсия", "apricot"], ["кайсии", "apricots"], ["мандарина", "tangerine"],
  ["мандарини", "tangerines"], ["смокиня", "fig"], ["слива", "plum"], ["сливи", "plums"], ["тиква", "pumpkin"], ["морков", "carrot"],
];
for (const [bg, en] of BG_EXTRA) addBg(bg, en, true);
const BG_MAX_WORDS = Math.max(...[...BG_LEX.keys()].map((k) => k.split(" ").length));

// ---------------------------------------------------------------------------
// Helpers

const CYR = /[а-яё]/i;
const LAT = /[a-z]/i;
/** "ШОКОЛАД" / "шоколад" → "Шоколад"; a Bulgarian flavour gets sentence case ("Ягода и Киви" → "Ягода и киви"). */
function sentenceBg(s: string): string {
  let t = s.trim().replace(/\s+/g, " ");
  if (!t) return t;
  if (t === t.toUpperCase() && /\p{L}{3}/u.test(t)) t = t.toLowerCase();
  // Latin brand words inside a Bulgarian flavour keep their case ("Шоколад с Орео" → "Шоколад с Орео" is fine too).
  const lower = t
    .split(" ")
    .map((w, i) => (i > 0 && CYR.test(w) && !/^[А-ЯЁ]{2,}$/.test(w) ? w.toLowerCase() : w))
    .join(" ");
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
function sentenceEn(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}
/** English as written in the export: ALL CAPS → Title Case, otherwise unchanged. */
function tidyLatin(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (t === t.toUpperCase() && /[A-Z]{3}/.test(t)) return t.toLowerCase().replace(/(^|[\s-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Texts that are no flavour at all (a pack form, a colour code, a stray size letter). */
const NOT_A_FLAVOUR = new Set([
  "прах", "капки", "капки)", "ампула", "ампули", "таблетки", "капсули", "drops", "liquid", "powder", "tablets", "capsules", "caps", "tabs",
  "m", "s", "l", "xl", "xxl", "xs", "течен", "течна", "сироп", "syrup", "шот", "shot", "gel", "гел", "стик", "sticks", "саше",
  "symbiotic complex", "magnesium threonate", "multi flavour", "multi flavor", "mix", "микс", "различни вкусове", "асорти", "assorted",
  "different flavors", "various", "various flavours", "new", "ново", "нов", "промоция", "promo", "sale",
]);

/** Leading / trailing words around a flavour: "Вкус Портокал", "С вкус на горски плодове", "Watermelon Flavor". */
function strip(raw: string): string {
  let s = raw.trim().replace(/\s+/g, " ");
  s = s.replace(/^[\s,;:|/\-(\[]+|[\s,;:|/\-)\]]+$/gu, "");
  s = s.replace(/^(?:с\s+)?(?:вкус|аромат)(?:\s+и\s+аромат)?(?:\s+на)?[:\s]+/iu, "");
  s = s.replace(/^(?:flavou?r|taste)[:\s]+/i, "");
  s = s.replace(/[\s-]+(?:flavou?red|flavou?r|flavou?rs|вкус)$/iu, "");
  return s.trim();
}

// ---------------------------------------------------------------------------
// English → Bulgarian (word by word)

type Tok = { text: string; lex: Lex | null };

function lexEn(words: string[]): Tok[] | null {
  const out: Tok[] = [];
  for (let i = 0; i < words.length; ) {
    let hit: Tok | null = null;
    for (let n = Math.min(EN_MAX_WORDS, words.length - i); n > 0; n--) {
      const k = words.slice(i, i + n).join(" ");
      const lex = EN_LEX.get(k);
      if (lex) {
        hit = { text: k, lex };
        i += n;
        break;
      }
    }
    if (!hit) return null;
    out.push(hit);
  }
  return out;
}

const genderIndex: Record<Gender, number> = { m: 0, f: 1, n: 2, p: 3 };

/** One run of words without connectors ("white chocolate", "strawberry cheesecake") → Bulgarian, or null. */
function segmentEnToBg(words: string[]): string | null {
  const toks = lexEn(words);
  if (!toks) return null;
  const real = toks.filter((t) => t.lex!.kind !== "filler");
  // "Lychee Fruit", "Blueberry Fruit": the trailing "fruit" repeats what the fruit already says.
  const last = real[real.length - 1]?.lex;
  if (real.length > 1 && last?.kind === "noun" && last.n.bg === "плодове" && real[real.length - 2].lex!.kind === "noun") real.pop();
  if (!real.length) return null;
  const headLex = real[real.length - 1].lex;
  if (headLex?.kind !== "noun") return null;
  const hn = headLex.n;
  const headBg = headLex.plural && hn.bgPl ? hn.bgPl : hn.bg;
  const headG: Gender = headLex.plural && hn.bgPl ? "p" : hn.g;
  const mods = real.slice(0, -1);
  if (hn.dish || mods.every((m) => m.lex!.kind === "adj")) {
    // Every modifier agrees with the head: "Strawberry Cheesecake" → "Ягодов чийзкейк", "White Chocolate" → "Бял шоколад".
    const words2: string[] = [];
    for (const m of mods) {
      const lex = m.lex!;
      const forms = lex.kind === "adj" ? lex.forms : lex.kind === "noun" ? lex.n.adj : undefined;
      if (!forms) {
        // A noun without an adjective form before a dish: "Mango Cheesecake" → "Чийзкейк с манго".
        if (lex.kind === "noun" && mods.length === 1) return `${headBg} с ${lex.n.bg}`;
        return null;
      }
      words2.push(forms[genderIndex[headG]]);
    }
    return [...words2, headBg].join(" ");
  }
  // A combination of flavours: "Strawberry Banana" → "Ягода и банан", "Pistachio White Chocolate" → "Шамфъстък и бял шоколад".
  const parts: string[] = [];
  let adjs: string[][] = [];
  for (const t of real) {
    const lex = t.lex!;
    if (lex.kind === "adj") adjs.push(lex.forms);
    else if (lex.kind === "noun") {
      const pl = lex.plural && !!lex.n.bgPl;
      parts.push([...adjs.map((f) => f[genderIndex[pl ? "p" : lex.n.g]]), pl ? lex.n.bgPl! : lex.n.bg].join(" "));
      adjs = [];
    }
  }
  if (adjs.length) return null;
  return parts.length > 2 ? `${parts.slice(0, -1).join(", ")} и ${parts[parts.length - 1]}` : parts.join(" и ");
}

const EN_CONNECTOR = /^(?:and|with|n|or)$/;

function enToBg(text: string): string | null {
  const key = phraseKey(text);
  const whole = PHRASE_INDEX.get(key);
  if (whole) return whole.bg;
  // Split at connectors: "and", "with", "-", "/", ",".
  const words = norm(text).replace(/\s*[-/,|]\s*/g, " and ").split(" ").filter(Boolean);
  const segs: { words: string[]; joiner: string }[] = [{ words: [], joiner: "" }];
  for (const w of words) {
    if (EN_CONNECTOR.test(w)) segs.push({ words: [], joiner: w === "with" ? "с" : "и" });
    else segs[segs.length - 1].words.push(w);
  }
  const out: string[] = [];
  for (const s of segs) {
    if (!s.words.length) continue;
    const phrase = PHRASE_INDEX.get(s.words.join(" "));
    const bg = phrase ? phrase.bg.toLowerCase() : segmentEnToBg(s.words);
    if (!bg) return null;
    if (out.length) out.push(s.joiner === "с" && /^[сз]/i.test(bg) ? "със" : s.joiner || "и");
    out.push(bg);
  }
  return out.length ? sentenceBg(out.join(" ")) : null;
}

// ---------------------------------------------------------------------------
// Bulgarian → English (word by word; Bulgarian and English put the describing word first alike)

function bgToEn(text: string): string | null {
  const key = phraseKey(text);
  const whole = PHRASE_INDEX.get(key);
  if (whole) return whole.en;
  const words = norm(text).replace(/\s*[-/,|]\s*/g, " и ").split(" ").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < words.length; ) {
    const w = words[i];
    if (w === "и") {
      out.push("&");
      i++;
      continue;
    }
    if (w === "с" || w === "със") {
      out.push("with");
      i++;
      continue;
    }
    let hit: string | null = null;
    for (let n = Math.min(BG_MAX_WORDS, words.length - i); n > 0; n--) {
      const k = words.slice(i, i + n).join(" ");
      const p = n > 1 ? PHRASE_INDEX.get(phraseKey(k)) : undefined;
      const lex = BG_LEX.get(k);
      if (p || lex) {
        hit = p ? p.en.toLowerCase() : lex!.en;
        i += n;
        break;
      }
    }
    if (!hit) {
      if (LAT.test(w) && !CYR.test(w)) {
        hit = w; // a Latin brand word inside a Bulgarian flavour ("Шоколад с Oreo")
        i++;
      } else return null;
    }
    out.push(hit);
  }
  if (!out.length || out[0] === "&" || out[0] === "with" || out[out.length - 1] === "&" || out[out.length - 1] === "with") return null;
  return sentenceEn(out.join(" ").replace(/\s+&\s+/g, " & "));
}

// ---------------------------------------------------------------------------
// Public API

export type FlavourNames = { bg: string; en: string | null };

const cache = new Map<string, FlavourNames | null>();

/**
 * Canonical names of a flavour as found in a product name or typed in the admin: Bulgarian display form (always)
 * and English (null when it cannot be translated). Null when the text is no flavour ("Прах", "Капки", "XL").
 */
export function flavourNames(raw: string | null | undefined): FlavourNames | null {
  if (!raw) return null;
  const hit = cache.get(raw);
  if (hit !== undefined) return hit;
  const res = compute(raw);
  if (cache.size > 20000) cache.clear();
  cache.set(raw, res);
  return res;
}

function compute(raw: string): FlavourNames | null {
  const s = strip(raw);
  if (!s || s.length < 2 || NOT_A_FLAVOUR.has(norm(s)) || /^\d/.test(s)) return null;
  const phrase = PHRASE_INDEX.get(phraseKey(s));
  if (phrase) return { bg: phrase.bg, en: phrase.en };
  if (CYR.test(s)) {
    // "Фъстъчено масло - банан" / "Портокал-Киви" → "Фъстъчено масло и банан" / "Портокал и киви".
    const bg = sentenceBg(s.replace(/(\p{L})\s*[-/]\s*(?=\p{L})/gu, "$1 и "));
    return { bg, en: bgToEn(s) };
  }
  // Latin: translate into Bulgarian when every word is known; English is the tidied original without filler words.
  const bg = enToBg(s);
  const tidy = tidyLatin(s);
  if (!bg) return { bg: tidy, en: tidy };
  const words = tidy.split(/\s+/).filter((w) => !FILLER.has(w.toLowerCase()));
  const en = words.length ? sentenceEn(words.join(" ").toLowerCase()) : tidy;
  return { bg, en: bgToEn(bg) ?? en };
}

/** Bulgarian display form of a flavour ("cookies & cream" → "Бисквита с крем"); unknown ones are tidied. */
export function flavourBg(f: string | null | undefined): string | null {
  return flavourNames(f)?.bg ?? null;
}

/** English display form of a flavour, or null when it cannot be translated. */
export function flavourEn(f: string | null | undefined): string | null {
  return flavourNames(f)?.en ?? null;
}

/** True when an English form exists that differs from the Bulgarian one or the flavour is Latin already. */
export function isTranslatedFlavour(bg: string | null, en: string | null): boolean {
  if (!bg) return true;
  return !!en || !CYR.test(bg);
}

/**
 * Grouping key of a flavour: two spellings with the same key are one flavour chip ("Бял шоколад с малина" /
 * "Бял шоколад с малини", "Cookies & Cream" / "Бисквити с крем").
 */
export function flavourKey(names: FlavourNames): string {
  const base = names.en ?? names.bg;
  return phraseKey(base)
    .split(" ")
    .filter((w) => w !== "and" && w !== "with" && w !== "с" && w !== "със")
    .map((w) => (w.length > 4 ? w.replace(/(?:ies|es|s|и|а|я)$/u, "") : w))
    .sort()
    .join(" ");
}
