// Lithuanian translation of the interface and of the solution steps.
// Step titles are translated with their math kept as is: "Subtract $2x$ from both sides" -> "Atimkite $2x$ iš abiejų pusių".
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };
export let lang = store.get('lang', (navigator.language || '').toLowerCase().startsWith('lt') ? 'lt' : 'en');
export function setLang(l) { lang = l; store.set('lang', l); document.documentElement.lang = l; }

// ---------------- exact step titles (math parts written as §) ----------------
const T = {
  'Answer': 'Atsakymas', 'Antiderivative': 'Pirmykštė funkcija', 'Area': 'Plotas', 'Calculate': 'Apskaičiuokite', 'Combine': 'Sutraukite', 'Constant': 'Konstanta', 'Data': 'Duomenys',
  'Domain': 'Apibrėžimo sritis', 'Given': 'Duota', 'Integrate': 'Integruokite', 'Pythagoras': 'Pitagoro teorema', 'Restriction': 'Apribojimas', 'Result': 'Rezultatas', 'Shortcut': 'Greitesnis būdas',
  'Simplify': 'Suprastinkite', 'Slope': 'Krypties koeficientas', 'Volume': 'Tūris', 'Vertex form': 'Viršūnės pavidalas', 'Exact form': 'Tiksli reikšmė', 'Decimal value': 'Dešimtainė reikšmė',
  'Decimal value (if you need it)': 'Dešimtainė reikšmė (jei reikia)', 'Case 1': '1 atvejis', 'Case 2': '2 atvejis', 'Part 1: ': '1 dalis: ', 'Part 2: ': '2 dalis: ',
  'Start with the problem': 'Pradinis uždavinys', 'Start with the equation': 'Pradinė lygtis', 'Start with the inequality': 'Pradinė nelygybė', 'Start with the compound inequality': 'Pradinė dviguba nelygybė',
  'Start with the expression': 'Pradinis reiškinys', 'Start with the fraction': 'Pradinė trupmena', 'Start with the function': 'Duota funkcija', 'Start with the integral': 'Pradinis integralas',
  'Start with the definite integral': 'Apibrėžtinis integralas', 'Start with the limit': 'Pradinė riba', 'Start with the matrix': 'Pradinė matrica', 'Start with the number': 'Pradinis skaičius',
  'Start with the sequence': 'Duota seka', 'Start with the series': 'Duota eilutė', 'Start with the system': 'Duota sistema', 'Start with the differential equation': 'Diferencialinė lygtis',
  'Evaluate the exponent': 'Apskaičiuokite laipsnį', 'Evaluate the logarithm': 'Apskaičiuokite logaritmą', 'Evaluate the exponential': 'Apskaičiuokite rodiklinę funkciją', 'Evaluate both sides': 'Apskaičiuokite abi puses',
  'Take the square root': 'Ištraukite kvadratinę šaknį', 'Multiply': 'Padauginkite', 'Divide': 'Padalykite', 'Add': 'Sudėkite', 'Subtract': 'Atimkite',
  'Multiply (long multiplication)': 'Padauginkite (stulpeliu)', 'Divide (long division)': 'Padalykite (kampu)', 'Divide (multiply by the reciprocal)': 'Dalyba (dauginame iš atvirkštinio skaičiaus)',
  'As a mixed number': 'Mišriuoju skaičiumi', 'Factorial: multiply all whole numbers down to 1': 'Faktorialas: sudauginkite visus natūraliuosius skaičius iki 1',
  'Convert the percent to a number (divide by 100)': 'Procentus paverskite skaičiumi (padalykite iš 100)', 'Absolute value (distance from zero)': 'Modulis (atstumas nuo nulio)',
  'Absolute value: the distance from 0, so drop the sign': 'Modulis – atstumas nuo 0, todėl ženklą atmetame', 'Angle in degrees': 'Kampas laipsniais',
  'Simplify the root': 'Suprastinkite šaknį', 'Simplify the root: take out the perfect power': 'Suprastinkite šaknį: iškelkite tikslųjį laipsnį', 'Simplify the square root': 'Suprastinkite kvadratinę šaknį',
  'Multiply the roots (same index: multiply the numbers inside)': 'Sudauginkite šaknis (to paties laipsnio: sudauginame pošaknius)',
  'Multiply: same base, so add the exponents': 'Daugyba: pagrindai vienodi, todėl laipsnių rodiklius sudedame', 'Divide: same base, so subtract the exponents': 'Dalyba: pagrindai vienodi, todėl rodiklius atimame',
  'Take the root: write as powers and multiply the exponents': 'Ištraukite šaknį: užrašykite laipsniais ir sudauginkite rodiklius', 'Take the root': 'Ištraukite šaknį',
  'Rationalize the denominator (multiply top and bottom by the root)': 'Panaikinkite iracionalumą vardiklyje (padauginkite skaitiklį ir vardiklį iš šaknies)',
  'Rationalize the denominator: multiply top and bottom by the conjugate': 'Panaikinkite iracionalumą vardiklyje: padauginkite iš jungtinio reiškinio',
  'Un-nest the root: find two numbers that add to the outside part': 'Išskleiskite sudėtinę šaknį', 'Multiply out the brackets': 'Atskliauskite', 'Multiply out the brackets (every term times every term)': 'Atskliauskite (kiekvieną narį dauginame iš kiekvieno)',
  'Add: combine like terms': 'Sudėkite: sutraukite panašiuosius narius', 'Subtract: combine like terms': 'Atimkite: sutraukite panašiuosius narius',
  'Combine like terms': 'Sutraukite panašiuosius narius', 'Simplify (combine like terms and powers)': 'Suprastinkite (sutraukite panašiuosius narius ir laipsnius)', 'Simplify exactly': 'Suprastinkite tiksliai',
  'Move everything to one side': 'Perkelkite viską į vieną pusę', 'Move everything to one side (set the equation equal to zero)': 'Perkelkite viską į vieną pusę (prilyginkite nuliui)',
  'Multiply both sides by §': 'Padauginkite abi puses iš §', 'Divide both sides by §': 'Padalykite abi puses iš §', 'Multiply both sides by $-1$': 'Padauginkite abi puses iš $-1$',
  'Subtract § from both sides': 'Iš abiejų pusių atimkite §', 'Add § to both sides': 'Prie abiejų pusių pridėkite §', 'Subtract § from all three parts': 'Iš visų trijų dalių atimkite §', 'Add § to all three parts': 'Prie visų trijų dalių pridėkite §',
  'Multiply both sides by the LCD §': 'Padauginkite abi puses iš bendro vardiklio §', 'Note the restriction: denominators can\'t be zero': 'Atkreipkite dėmesį: vardikliai negali būti lygūs nuliui',
  'Check: put the answer back into the original equation': 'Patikrinimas: įstatykite atsakymą į pradinę lygtį', 'Check in both equations': 'Patikrinkite abi lygtis',
  'Use the quadratic formula': 'Taikykite kvadratinės lygties sprendinių formulę', 'Substitute the values': 'Įstatykite reikšmes', 'Simplify the discriminant': 'Apskaičiuokite diskriminantą',
  'Write the two solutions': 'Užrašykite abu sprendinius', 'Write it as §': 'Užrašykite pavidalu §', 'Zero product property: set each factor equal to zero': 'Sandauga lygi nuliui, kai bent vienas daugiklis lygus nuliui',
  'Zero product: one of the factors is 0': 'Sandauga lygi nuliui: vienas iš daugiklių lygus 0', 'Solve each one': 'Išspręskite kiekvieną', 'Solve the linear factor': 'Išspręskite tiesinį daugiklį',
  'Set the repeated factor equal to zero': 'Kartotinį daugiklį prilyginkite nuliui', 'Split into two cases': 'Išskaidykite į du atvejus', 'Isolate the absolute value': 'Atskirkite modulį',
  'Isolate the radical': 'Atskirkite šaknį', 'Isolate the exponential': 'Atskirkite rodiklinį reiškinį', 'Isolate the logarithm': 'Atskirkite logaritmą', 'Isolate §': 'Atskirkite §',
  'The bases are equal, so the exponents are equal': 'Pagrindai lygūs, todėl lygūs ir rodikliai', 'The logs have the same base, so their arguments are equal': 'Logaritmų pagrindai vienodi, todėl lygūs reiškiniai po logaritmu',
  'Take the natural log of both sides: §': 'Logaritmuokite abi puses: §', 'Rewrite in exponential form: §': 'Užrašykite rodikliniu pavidalu: §',
  'Combine the logarithms: §, §': 'Sutraukite logaritmus: §, §', 'Product and quotient rules: §, §': 'Logaritmų sandaugos ir dalmens savybės: §, §', 'Power rule: §': 'Laipsnio taisyklė: §',
  'Test a point in each interval (sign chart)': 'Kiekviename intervale patikrinkite tašką (ženklų lentelė)', 'Find the critical points (where the expression is zero or undefined)': 'Raskite kritinius taškus (kur reiškinys lygus nuliui arba neapibrėžtas)',
  'Keep only the values where everything is defined': 'Palikite tik reikšmes iš apibrėžimo srities', 'Read off the solution': 'Užrašykite sprendinį',
  'Use the inverse §: § = §': 'Taikykite atvirkštinę funkciją §: § = §', 'Solutions in one full turn §': 'Sprendiniai per vieną apsisukimą §', 'Solve for §': 'Išspręskite §', 'Solve §': 'Išspręskite §',
  'Isolate the variable': 'Atskirkite kintamąjį', 'Factor': 'Išskaidykite dauginamaisiais', 'Factored form': 'Išskaidytas pavidalas', 'Factor by grouping': 'Išskaidykite grupuodami',
  'Factor out the greatest common factor §': 'Iškelkite bendrą daugiklį §', 'Factor out §': 'Iškelkite §', 'Factor out the common binomial': 'Iškelkite bendrą dvinarį',
  'Difference of squares: §': 'Kvadratų skirtumas: §', 'Perfect square trinomial: §': 'Pilnasis kvadratas: §', 'Find two numbers that multiply to § and add to §': 'Raskite du skaičius, kurių sandauga §, o suma §',
  'This quadratic cannot be factored over the rational numbers': 'Šio kvadratinio trinario negalima išskaidyti racionaliaisiais skaičiais', 'Write the polynomial as a product of factors': 'Užrašykite daugianarį dauginamaisiais',
  'No rational roots: this polynomial cannot be factored further over the rationals': 'Racionaliųjų šaknų nėra: toliau skaidyti negalima',
  'Factor the numerator and the denominator': 'Išskaidykite skaitiklį ir vardiklį', 'Cancel the common factors': 'Suprastinkite bendrus daugiklius',
  'The top and bottom have no common factors, so this is already as simple as it gets': 'Skaitiklis ir vardiklis neturi bendrų daugiklių, todėl reiškinys jau suprastintas',
  'This expression is already as simple as it gets': 'Šis reiškinys jau suprastintas', 'Expand (distribute) and combine like terms': 'Atskliauskite ir sutraukite panašiuosius narius',
  'Expand the expression first': 'Pirmiausia atskliauskite', 'FOIL: First, Outer, Inner, Last': 'Atskliauskite: kiekvieną narį dauginame iš kiekvieno', 'Distribute (multiply every term by every term)': 'Atskliauskite (kiekvieną narį dauginame iš kiekvieno)',
  'Split the fraction: divide every term on top by the bottom': 'Išskaidykite trupmeną: kiekvieną skaitiklio narį dalykite iš vardiklio',
  // calculus
  'Find the derivative': 'Raskite išvestinę', 'The derivative': 'Išvestinė', 'Sum rule: differentiate each term separately': 'Sumos taisyklė: diferencijuokite kiekvieną narį atskirai',
  'Power rule: § = §': 'Laipsnio taisyklė: § = §', 'Constant multiple rule: §': 'Konstantą iškelkite: §', 'Product rule: §': 'Sandaugos išvestinė: §', 'Quotient rule: §': 'Dalmens išvestinė: §',
  'Chain rule with the power rule: §': 'Sudėtinės funkcijos išvestinė: §', 'Logarithmic differentiation: §': 'Logaritminis diferencijavimas: §', 'Derivative (slope at any point)': 'Išvestinė (krypties koeficientas bet kuriame taške)',
  'Second derivative test': 'Antrosios išvestinės testas', 'Critical points (where the derivative is 0)': 'Kritiniai taškai (išvestinė lygi 0)', 'Find the coefficient': 'Raskite koeficientą',
  'Start with the integral ': 'Pradinis integralas', 'Sum rule: integrate each term separately': 'Sumos taisyklė: integruokite kiekvieną narį atskirai', 'Power rule: § = § ': 'Laipsnio taisyklė: §',
  'Constant multiple rule: move the constant outside the integral': 'Konstantą iškelkite prieš integralą', 'Constant multiple rule: pull the constant out': 'Konstantą iškelkite',
  'Integral of a constant: §': 'Konstantos integralas: §', 'Add the constant of integration §': 'Pridėkite integravimo konstantą §', 'Integration by parts: §': 'Integravimas dalimis: §',
  'Integrate by parts twice: the same integral § comes back': 'Integruokite dalimis du kartus: grįžta tas pats integralas §', 'Solve the equation for §': 'Išspręskite lygtį §',
  'Check: differentiating the answer gives back the original function ✓': 'Patikrinimas: atsakymo išvestinė lygi pradinei funkcijai ✓', 'Fundamental Theorem of Calculus: evaluate §': 'Niutono ir Leibnico formulė: §',
  'Put § back': 'Grąžinkite §', 'The integral becomes a polynomial in §': 'Integralas tampa daugianariu kintamojo §', 'Find all antiderivatives': 'Raskite visas pirmykštes funkcijas',
  'Partial fractions: factor the denominator and split the fraction': 'Paprasčiausios trupmenos: išskaidykite vardiklį ir trupmeną', 'One fraction for each factor': 'Po vieną trupmeną kiekvienam daugikliui',
  'Factor the bottom': 'Išskaidykite vardiklį', 'The top has degree ≥ the bottom: divide first': 'Skaitiklio laipsnis ≥ vardiklio: pirmiausia padalykite',
  'Polynomial long division (the top has degree ≥ the bottom)': 'Daugianarių dalyba kampu (skaitiklio laipsnis ≥ vardiklio)', 'Check: adding the fractions back gives the original ✓': 'Patikrinimas: sudėjus trupmenas gaunama pradinė ✓',
  'Direct substitution works (the function is continuous here)': 'Tiesiog įstatome (funkcija čia tolydi)', 'Direct substitution gives § (indeterminate form)': 'Įstačius gaunama § (neapibrėžtumas)',
  'L’Hôpital’s rule: differentiate the top and bottom': 'Lopitalio taisyklė: diferencijuokite skaitiklį ir vardiklį', 'Now substitute': 'Dabar įstatykite', 'So the limit is': 'Taigi riba lygi',
  'The function grows without bound': 'Funkcija neaprėžtai didėja', 'Estimate numerically by approaching from both sides': 'Įvertinkite skaitiškai artėdami iš abiejų pusių',
  'The left and right limits are different, so the limit does not exist': 'Kairioji ir dešinioji ribos skirtingos, todėl riba neegzistuoja', 'Evaluate for larger and larger values': 'Apskaičiuokite vis didesnėms reikšmėms',
  'The degree of the top is smaller than the bottom, so the limit is 0': 'Skaitiklio laipsnis mažesnis už vardiklio, todėl riba lygi 0', 'Same degree: the limit is the ratio of the leading coefficients': 'Laipsniai vienodi: riba lygi vyresniųjų koeficientų santykiui',
  'Differentiate the top and bottom': 'Diferencijuokite skaitiklį ir vardiklį', 'Approach from that side': 'Artėkite iš tos pusės',
  // sequences, series, probability, statistics
  'This is a geometric series: each term is the previous one times §': 'Tai geometrinė progresija: kiekvienas narys lygus ankstesniajam, padaugintam iš §',
  'Because §, use §': 'Kadangi §, taikome §', 'Add many terms numerically until the total stops changing': 'Sudėkite daug narių, kol suma nustos keistis',
  'The terms do not shrink fast enough, so the series diverges': 'Nariai mažėja per lėtai, todėl eilutė diverguoja', 'Split the sum and use the power-sum formulas': 'Išskaidykite sumą ir taikykite laipsnių sumų formules',
  'The difference between terms is always the same: arithmetic sequence': 'Skirtumas tarp narių pastovus: aritmetinė progresija', 'Each term is the previous one times the same number: geometric sequence': 'Kiekvienas narys gaunamas dauginant iš to paties skaičiaus: geometrinė progresija',
  'First differences': 'Pirmieji skirtumai', 'Mean = sum / count': 'Vidurkis = suma / kiekis', 'Mean = sum ÷ count': 'Vidurkis = suma ÷ kiekis', 'Median: middle value after sorting': 'Mediana: vidurinė reikšmė surikiavus',
  'Median: the middle value after sorting': 'Mediana: vidurinė reikšmė surikiavus', 'Mode: the most frequent value': 'Moda: dažniausia reikšmė', 'Sort the numbers': 'Surikiuokite skaičius',
  'Favourable outcomes / all outcomes': 'Palankios baigtys / visos baigtys', 'Favourable choices / all choices': 'Palankūs pasirinkimai / visi pasirinkimai', 'Favourable / all': 'Palankios / visos',
  'Ways to pick only these / all ways': 'Palankių būdų skaičius / visų būdų skaičius', 'Choose a group: combinations': 'Renkame grupę: deriniai', '“At least once” = 1 − “never”': '„Bent kartą“ = 1 − „nė karto“',
  'Permutations with repeated letters': 'Kėliniai su pasikartojančiomis raidėmis', 'New sum − old sum': 'Nauja suma − sena suma',
  // word problems
  'Speed = distance / time': 'Greitis = kelias / laikas', 'Time = distance / speed': 'Laikas = kelias / greitis', 'Distance = speed · time': 'Kelias = greitis · laikas',
  'Average speed = total distance / total time': 'Vidutinis greitis = visas kelias / visas laikas', 'They close the gap at the sum of their speeds': 'Jie artėja greičių suma',
  'Current = (downstream − upstream) / 2': 'Tėkmės greitis = (pasroviui − prieš srovę) / 2', 'Own speed = (downstream + upstream) / 2': 'Savasis greitis = (pasroviui + prieš srovę) / 2',
  'Workers × time stays the same': 'Darbininkų skaičius × laikas nekinta', 'Add the parts done per unit of time': 'Sudėkite per laiko vienetą atliekamas dalis',
  'Emptying works against filling: subtract the rates': 'Ištuštinimas veikia priešingai: našumus atimame', 'Multiply by the percentage as a fraction': 'Padauginkite iš procentų, užrašytų trupmena',
  'Part = whole · percentage': 'Dalis = visuma · procentai', 'Change ÷ original × 100': 'Pokytis ÷ pradinė reikšmė × 100', 'Multiply the factors': 'Sudauginkite koeficientus',
  'The dissolved amount stays the same, the total grows': 'Ištirpusios medžiagos kiekis nekinta, bendra masė didėja', 'Multiply by $1 + r$ every year': 'Kasmet dauginame iš $1 + r$',
  'Add whole turns § to get every solution': 'Pridėkite pilnus apsisukimus §, kad gautumėte visus sprendinius',
  'The equation repeats every §: find all solutions in one full turn §': 'Lygtis kartojasi kas §: raskite visus sprendinius per vieną apsisukimą §',
  'Take out the common factor §': 'Iškelkite bendrą daugiklį §', 'Use the double-angle formulas §, §': 'Taikykite dvigubo kampo formules §, §',
  'Divide by § (it can’t be 0 here): §': 'Padalykite iš § (čia jis nelygus 0): §',
  'Find the derivative ': 'Raskite išvestinę', 'What we need': 'Ko ieškome', 'Substitute and simplify': 'Įstatykite ir suprastinkite', 'Use the given value to find the unknown, then evaluate': 'Iš duotos reikšmės raskite nežinomąjį ir apskaičiuokite',
  'Rectangle': 'Stačiakampis', 'Circle': 'Skritulys', 'Cube': 'Kubas', 'Cylinder': 'Ritinys', 'Cone': 'Kūgis', 'Sphere': 'Rutulys', 'Right triangle': 'Statusis trikampis',
};
// more exact titles
Object.assign(T, {
  'Constant multiple rule: move the constant outside the integral': 'Konstantą iškelkite prieš integralą', 'Check the answers in the original equation': 'Patikrinkite atsakymus pradinėje lygtyje',
  'Check the answers in the original equation (reject extraneous solutions)': 'Patikrinkite atsakymus pradinėje lygtyje (atmeskite pašalinius sprendinius)', 'Combinations (order does not matter)': 'Deriniai (tvarka nesvarbi)',
  'Derivative of § is §': '§ išvestinė yra §', 'Point on the curve: put in the x-value': 'Taškas kreivėje: įstatykite x reikšmę', 'Slope = derivative at that point': 'Krypties koeficientas = išvestinė tame taške',
  'Point-slope form §': 'Tiesės per tašką lygtis §', 'Add up the terms': 'Sudėkite narius', 'This equation can’t be solved with algebra alone, so we find the solutions numerically': 'Šios lygties algebriškai neišspręsime, todėl sprendinius randame skaitiškai',
  'Write §, then swap § and §': 'Užrašykite §, tada sukeiskite § ir § vietomis', 'Chain rule: §': 'Sudėtinės funkcijos išvestinė: §', 'Multiply both sides by § to clear the fractions': 'Padauginkite abi puses iš §, kad neliktų trupmenų',
  'Distribute (multiply out the parentheses) and combine like terms': 'Atskliauskite ir sutraukite panašiuosius narius', 'Vertical asymptotes: where the bottom is 0 (and the top is not)': 'Vertikaliosios asimptotės: kur vardiklis lygus 0 (o skaitiklis ne)',
  'Exponential rule: §': 'Rodiklinės funkcijos išvestinė: §', 'Form §: rewrite the product as a fraction, then use L’Hôpital’s rule': 'Pavidalas §: sandaugą užrašykite trupmena ir taikykite Lopitalio taisyklę',
  'Multiply out and use §': 'Atskliauskite ir pasinaudokite §', 'Multiply top and bottom by the conjugate (a + b)(a - b) = a² - b²': 'Skaitiklį ir vardiklį padauginkite iš jungtinio reiškinio: (a + b)(a - b) = a² - b²',
  'Rational Root Theorem: test § where § divides the constant and § divides the leading coefficient': 'Racionaliųjų šaknų teorema: tikriname §, kur § dalija laisvąjį narį, o § – vyriausiąjį koeficientą',
  'Take the natural log of both sides': 'Logaritmuokite abi puses (natūrinis logaritmas)', 'Take the logarithm of both sides': 'Logaritmuokite abi puses', 'Take § of both sides': 'Abiem pusėms taikykite §',
  'Write both equations in standard form': 'Abi lygtis užrašykite standartiniu pavidalu', 'Add the equations to eliminate §': 'Sudėkite lygtis, kad pašalintumėte §', 'Subtract the equations to eliminate §': 'Atimkite lygtis, kad pašalintumėte §',
  'Chain rule: derivative of the outside (§) times derivative of the inside': 'Sudėtinės funkcijos išvestinė: išorinės funkcijos išvestinė (§) kart vidinės išvestinė',
  '§ (integration by parts)': '§ (integravimas dalimis)', 'Substitution: let §, so §': 'Keitinys: pažymėkime §, tada §', '§ (divide by the inner coefficient §)': '§ (dalijame iš vidinio koeficiento §)',
  'Formula §': 'Formulė §', 'Next term and sum of the first § terms §': 'Kitas narys ir pirmųjų § narių suma §', 'Arithmetic: the same difference each time': 'Aritmetinė: kaskart tas pats skirtumas',
  'Number of terms §': 'Narių skaičius §', 'Number of terms: §': 'Narių skaičius: §', 'Eigenvalues solve §': 'Tikrinės reikšmės tenkina §', 'Solve for § (write §)': 'Išreikškite § (pažymėkite §)',
  'Linear equation: write it as §': 'Tiesinė lygtis: užrašykite ją pavidalu §', 'Integrating factor §': 'Integruojantysis daugiklis §', 'Then §, so integrate': 'Tada §, todėl integruojame',
  'Divide by §': 'Padalykite iš §', 'Difference: elements of the first set that are not in the second': 'Skirtumas: pirmosios aibės elementai, kurių nėra antrojoje',
  'Intersection: elements in both sets': 'Sankirta: elementai, esantys abiejose aibėse', 'Union: elements in either set': 'Sąjunga: elementai, esantys bent vienoje aibėje', 'Use the point § to find §': 'Pasinaudokite tašku §, kad rastumėte §',
  'Apply § to both sides': 'Abiem pusėms taikykite §', 'Raise both sides to the power §': 'Abi puses kelkite § laipsniu', 'An even root needs a value that is not negative: §': 'Lyginio laipsnio šaknies pošaknis neneigiamas: §',
  'A logarithm needs a positive input: §': 'Logaritmuojamasis reiškinys teigiamas: §', 'You can’t divide by zero: §': 'Dalyti iš nulio negalima: §',
  'Values at the critical points in one period give the smallest and largest value': 'Reikšmės kritiniuose taškuose per vieną periodą duoda mažiausią ir didžiausią reikšmę',
  'AC method: §. Find two numbers that multiply to § and add to §: § and §': 'AC metodas: §. Raskite du skaičius, kurių sandauga §, o suma §: § ir §',
  'Divide by § using synthetic division': 'Padalykite iš § Hornerio schema', 'Substitute § to get a quadratic': 'Pažymėkite §, gausite kvadratinę lygtį', 'Write § as a power of §': 'Užrašykite § kaip § laipsnį',
  '§ means §': '§ reiškia §', 'Divide all three parts by §': 'Visas tris dalis padalykite iš §', 'Substitute § back into an original equation': 'Įstatykite § į pradinę lygtį',
  'Eliminate the § entries in the other rows': 'Panaikinkite § koeficientus kitose eilutėse', 'Elimination: make the § coefficients match (multiply equation 1 by § and equation 2 by §)': 'Sudėties būdas: suvienodinkite § koeficientus (1-ąją lygtį dauginkite iš §, 2-ąją – iš §)',
  'Divide both sides by § (assuming §)': 'Padalykite abi puses iš § (kai §)', 'Horizontal asymptote: same degree, so divide the leading coefficients': 'Horizontalioji asimptotė: laipsniai vienodi, todėl dalijame vyriausiuosius koeficientus',
  'Oblique (slant) asymptote: divide the polynomials, keep the quotient': 'Pasviroji asimptotė: padalykite daugianarius, imkite dalmenį', 'Horizontal asymptote: the bottom has the higher degree': 'Horizontalioji asimptotė: vardiklio laipsnis didesnis',
  'At §: neither (the slope does not change sign)': '§: nei maksimumas, nei minimumas (išvestinė nekeičia ženklo)', 'Odd power of cos: keep one factor and write the rest with §': 'Nelyginis cos laipsnis: palikite vieną daugiklį, o likusius užrašykite pagal §',
  'Reverse chain rule: §': 'Atvirkštinė sudėtinės funkcijos taisyklė: §', 'No simple antiderivative was found, so the integral is computed numerically (Simpson’s rule)': 'Paprastos pirmykštės nerasta, todėl integralas apskaičiuotas skaitiškai (Simpsono metodas)',
  'Divide the top and bottom by the highest power § in the denominator': 'Skaitiklį ir vardiklį padalykite iš aukščiausio vardiklio laipsnio §', 'Variable in the base and the exponent: write §': 'Kintamasis ir pagrinde, ir rodiklyje: užrašykite §',
  'Next term': 'Kitas narys', 'Second differences are all the same, so § with § = that difference': 'Antrieji skirtumai vienodi, todėl §, kur § = tas skirtumas', 'Match the first terms to find § and §': 'Pagal pirmuosius narius raskite § ir §',
  'Split the term into partial fractions': 'Narį išskaidykite paprasčiausiomis trupmenomis', 'Write out the first terms: almost everything cancels (a telescoping sum)': 'Išrašykite pirmuosius narius: beveik viskas susiprastina',
  'Add the terms that are left': 'Sudėkite likusius narius', 'Geometric: each term is multiplied by the same ratio': 'Geometrinė: kiekvienas narys dauginamas iš to paties vardiklio',
  'Geometric with §, so the infinite sum converges': 'Geometrinė, kai §, todėl begalinė suma konverguoja', 'Multiply top and bottom by the conjugate of the denominator': 'Skaitiklį ir vardiklį padauginkite iš vardiklio jungtinio',
  'The discriminant is negative, so there are no real solutions. Using §:': 'Diskriminantas neigiamas, realiųjų sprendinių nėra. Naudojame §:', 'Modulus §': 'Modulis §', 'For a 2×2 matrix: §': '2×2 matricai: §',
  'Expand along the first row (cofactor expansion)': 'Skleiskite pagal pirmąją eilutę', 'Work out each 2×2 determinant (§)': 'Apskaičiuokite kiekvieną 2×2 determinantą (§)',
  'Swap § and §, change the signs of § and §, divide by the determinant': 'Sukeiskite § ir §, pakeiskite § ir § ženklus, padalykite iš determinanto', 'Divide each entry': 'Padalykite kiekvieną elementą',
  'Each entry = (row of the first) · (column of the second)': 'Kiekvienas elementas = (pirmosios eilutė) · (antrosios stulpelis)', 'For 2×2: §': '2×2: §', 'Eigenvector for §: solve §': 'Tikrinis vektorius, kai §: išspręskite §',
  'Expand § along the first row': 'Skleiskite § pagal pirmąją eilutę', 'Integrate both sides with respect to §': 'Integruokite abi puses pagal §', 'Average the two middle numbers': 'Raskite dviejų vidurinių skaičių vidurkį',
  'Square each distance from the mean': 'Pakelkite kvadratu kiekvieną nuokrypį nuo vidurkio', 'Variance = average of the squares (population: ÷ n, sample: ÷ (n−1))': 'Dispersija = kvadratų vidurkis (populiacija: ÷ n, imtis: ÷ (n−1))',
  '§, so the other side is §': '§, todėl kita kraštinė yra §', '§ (2 numbers) §': '§ (2 skaičiai) §', 'New value = old · (1 + p)': 'Nauja reikšmė = sena · (1 + p)', 'Hypotenuse §': 'Įžambinė §',
  'Volume of revolution §; the curve meets the x-axis at': 'Sukinio tūris §; kreivė kerta x ašį taške', 'Each term is the previous one times the same number: geometric sequence': 'Kiekvienas narys gaunamas dauginant iš to paties skaičiaus: geometrinė progresija',
  'Add them up': 'Sudėkite', 'Together they do § of the job per unit of time; subtract the known part': 'Kartu per laiko vienetą atliekama § darbo; atimkite žinomą dalį', 'Permutations (order matters)': 'Kėliniai (tvarka svarbi)', 'Put § into it': 'Įstatykite §', 'The slope of the tangent is the derivative': 'Liestinės krypties koeficientas lygus išvestinei',
  'Set it equal to the slope': 'Prilyginkite krypties koeficientui', 'New value = old · (1 - p)': 'Nauja reikšmė = sena · (1 − p)',
  'Multiply by § every year': 'Kasmet dauginame iš §', '§: subtract the two given terms': '§: atimkite du duotus narius', 'One part = total / (a + b)': 'Viena dalis = visas kiekis / (a + b)',
  'Find the pattern: the general term': 'Raskite dėsningumą: bendrasis narys', 'Find § for each value of §': 'Kiekvienai § reikšmei raskite §', 'One part is §, the other §: §': 'Viena dalis §, kita §: §',
  'Write the expression in expanded form': 'Užrašykite reiškinį išskleistu pavidalu', 'Write the factors as fractions: most numerators and denominators cancel': 'Daugiklius užrašykite trupmenomis: dauguma skaitiklių ir vardiklių susiprastina',
  'Split each term into partial fractions: most terms cancel (telescoping)': 'Kiekvieną narį išskaidykite paprasčiausiomis trupmenomis: dauguma narių susiprastina', 'Calculate the number': 'Apskaičiuokite skaičių', 'Count its digits': 'Suskaičiuokite jo skaitmenis',
  'Two different real solutions: the discriminant § must be positive': 'Du skirtingi realieji sprendiniai: diskriminantas § turi būti teigiamas', 'Exactly one solution (the line touches the curve): the discriminant § must be zero': 'Lygiai vienas sprendinys (tiesė liečia kreivę): diskriminantas § turi būti lygus nuliui',
  'Where do the curves meet? Solve §': 'Kur kreivės susikerta? Išspręskite §', 'Area from § to §: integrate the top curve minus the bottom one': 'Plotas nuo § iki §: integruokite viršutinės kreivės ir apatinės skirtumą',
  'The function increases where §': 'Funkcija didėja, kai §', 'The function decreases where §': 'Funkcija mažėja, kai §', 'Take the logarithm base § of both sides': 'Abi puses logaritmuokite pagrindu §',
  'Speed is the derivative of the position, acceleration the derivative of the speed': 'Greitis yra kelio išvestinė, pagreitis – greičio išvestinė', 'Speed 0: solve §': 'Greitis 0: išspręskite §', 'Acceleration at §': 'Pagreitis, kai §', 'Speed at §': 'Greitis, kai §',
  'The amount of the dissolved substance stays the same': 'Ištirpusios medžiagos kiekis nesikeičia', 'Subtract all the percentages from the gross salary': 'Iš atlyginimo „ant popieriaus“ atimkite visus procentus',
  'Time downstream + time upstream = total time': 'Laikas pasroviui + laikas prieš srovę = visas laikas', 'Average speed = total distance / total time (equal halves)': 'Vidutinis greitis = visas kelias / visas laikas (lygios pusės)',
  'Speed from passing the pole': 'Greitis pagal tai, kaip pravažiuoja stulpą', 'On the bridge the train covers the bridge plus its own length': 'Tiltu traukinys nuvažiuoja tilto ilgį ir savo ilgį', 'Planned time − real time = time saved': 'Planuotas laikas − tikrasis laikas = sutaupytas laikas',
  'The faster runner gains one whole lap': 'Greitesnis bėgikas aplenkia per vieną ratą', '§: divide the two given terms': '§: padalykite du duotus narius', 'Digits do not repeat: 10 · 9 · 8 · …': 'Skaitmenys nesikartoja: 10 · 9 · 8 · …',
  'The largest angle is opposite the longest side': 'Didžiausias kampas yra prieš ilgiausią kraštinę', 'Perpendicular: the dot product is 0': 'Statmeni: skaliarinė sandauga lygi 0', 'Two sides § and one side §: §': 'Dvi kraštinės § ir viena kraštinė §: §', 'Sides and area': 'Kraštinės ir plotas',
  'Power rule: §': 'Laipsnio taisyklė: §', 'Product rule: §': 'Sandaugos išvestinė: §', 'Quotient rule: §': 'Dalmens išvestinė: §', 'Sum rule: differentiate each term': 'Sumos išvestinė: diferencijuokite kiekvieną narį',
});

// patterns with numbers or words outside the math parts
const R = [
  [/^Value at § \((end of the interval|critical point|endpoint)\)$/, (m, w) => `Reikšmė, kai § (${w === 'critical point' ? 'kritinis taškas' : 'intervalo galas'})`],
  [/^Derivative number (\d+)$/, '$1-oji išvestinė'], [/^Find (.+)% of (.+)$/, 'Raskite $1 % nuo $2'], [/^Take the (\w+) root of both sides( \(remember §\))?$/, 'Iš abiejų pusių ištraukite šaknį$2'],
  [/^Take the cube root$/, 'Ištraukite kubinę šaknį'], [/^Take the (\d+)th root$/, 'Ištraukite $1-ojo laipsnio šaknį'], [/^At § : (.+)$/, '§: $1'],
  [/^At §: local maximum$/, '§: lokalusis maksimumas'], [/^At §: local minimum$/, '§: lokalusis minimumas'], [/^Value at § \((.+)\)$/, 'Reikšmė, kai § ($1)'],
  [/^The (largest|smallest) value$/, (m, a) => (a === 'largest' ? 'Didžiausia reikšmė' : 'Mažiausia reikšmė')], [/^Critical points: solve §$/, 'Kritiniai taškai: išspręskite §'],
  [/^Critical points inside the interval: solve §$/, 'Kritiniai taškai intervale: išspręskite §'], [/^Put in §$/, 'Įstatykite §'], [/^Substitute §$/, 'Įstatykite §'],
  [/^Evaluate (\w+)( \(degrees\))?$/, 'Apskaičiuokite $1$2'], [/^Apply (\w+)$/, 'Taikykite $1'], [/^Solve equation (\d+) for §$/, 'Iš $1-osios lygties išreikškite §'],
  [/^Substitute into equation (\d+)$/, 'Įstatykite į $1-ąją lygtį'], [/^Multiply by (\d+) every period$/, 'Kas periodą dauginame iš $1'],
  [/^(Add|Subtract) the fractions using a common denominator(.*)$/, (m, a, b) => `${a === 'Add' ? 'Sudėkite' : 'Atimkite'} trupmenas, subendravardiklinę${b.replace('(', '(vardiklis ')}`],
  [/^Keep only the solutions in (.+)$/, 'Palikite tik sprendinius intervale $1'], [/^Count the outcomes with sum (\d+) out of all (\d+)$/, 'Suskaičiuokite baigtis, kurių suma $1, iš visų $2'],
  [/^(\d+) choices for every digit$/, 'Kiekvienam skaitmeniui $1 galimybių'], [/^Pure part before: (\d+)% of (\d+); after adding § kg it must be (\d+)%$/, 'Grynos medžiagos prieš: $1 % nuo $2; pridėjus § kg turi būti $3 %'],
  [/^Raise both sides to the power (\d+)$/, 'Abi puses kelkite $1 laipsniu'], [/^Divide row (\d+) by §$/, '$1-ąją eilutę padalykite iš §'], [/^Write out the (\d+) terms \((\w) = (\d+) to (\d+)\)$/, 'Išrašykite $1 narių ($2 = $3, …, $4)'],
  [/^§ ways to order (\d+) things$/, '§ būdų išdėstyti $1 daiktus'], [/^Outcomes with sum (\d+) \/ all (\d+)$/, 'Baigtys su suma $1 / visos $2'], [/^Each place: (\d+) choices$/, 'Kiekvienai vietai: $1 galimybių'],
  [/^(Add|Subtract) § (to|from) both sides$/, (m, a) => (a === 'Add' ? 'Prie abiejų pusių pridėkite §' : 'Iš abiejų pusių atimkite §')], [/^(Multiply|Divide) both sides by §$/, (m, a) => (a === 'Multiply' ? 'Padauginkite abi puses iš §' : 'Padalykite abi puses iš §')],
];
// a phrase-by-phrase translation is only used when nothing English is left over
const ENGLISH = /(?<![\wąčęėįšųūž])(the|of|to|is|are|by|for|in|at|on|it|that|this|with|from|into|so|then|where|when|not|each|every|out|up|as|an?|be|has|have|only|same|use|using|first|second|like|terms?|equations?|value|answers?|original|numbers?|find|write|take|put|both|sides)(?![\wąčęėįšųūž])/i;
// phrases, longest first, for everything else
const PH = [
  ['both sides', 'abi puses'], ['the equation', 'lygtį'], ['the inequality', 'nelygybę'], ['the derivative', 'išvestinę'], ['the integral', 'integralą'], ['the function', 'funkciją'],
  ['solutions', 'sprendiniai'], ['solution', 'sprendinys'], ['no solution', 'sprendinių nėra'], ['Solve', 'Išspręskite'], ['Find', 'Raskite'], ['Write', 'Užrašykite'], ['Substitute', 'Įstatykite'],
  ['Multiply', 'Padauginkite'], ['Divide', 'Padalykite'], ['Subtract', 'Atimkite'], ['Add', 'Pridėkite'], ['Simplify', 'Suprastinkite'], ['Factor', 'Išskaidykite'], ['Check', 'Patikrinimas'],
  ['Use', 'Taikykite'], ['Isolate', 'Atskirkite'], ['Integrate', 'Integruokite'], ['Evaluate', 'Apskaičiuokite'], ['and', 'ir'], ['or', 'arba'], ['the ', ''], ['The ', ''],
];

function mask(s) { const parts = []; const m = s.replace(/\$[^$]*\$/g, (x) => { parts.push(x); return '§'; }); return [m, parts]; }
function unmask(s, parts) { let i = 0; return s.replace(/§(\d)?/g, (x, k) => (k ? parts[Number(k) - 1] : parts[i++]) ?? ''); }
export function trStep(title) {
  if (lang !== 'lt' || !title) return title;
  const pt = String(title).match(/^Part (\d): (.+)$/);
  if (pt) return `${pt[1]} dalis: ${trStep(pt[2])}`;
  const [m, parts] = mask(String(title));
  const key = m.trim();
  if (T[key] !== undefined) return unmask(T[key], parts);
  for (const [re, rep] of R) if (re.test(key)) return unmask(key.replace(re, rep), parts);
  let out = key;
  for (const [en, lt] of PH) out = out.replace(new RegExp(`\\b${en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${/\w$/.test(en) ? '\\b' : ''}`, 'g'), lt);
  return ENGLISH.test(out) ? title : unmask(out, parts);
}

// ---------------- result titles, answer labels, errors ----------------
const KIND = {
  Calculate: 'Skaičiavimas', Evaluate: 'Reikšmė', Simplify: 'Suprastinimas', Factor: 'Skaidymas', Expand: 'Atskliaudimas', Derivative: 'Išvestinė', Integral: 'Integralas', 'Definite integral': 'Apibrėžtinis integralas',
  Limit: 'Riba', Sum: 'Suma', Product: 'Sandauga', 'Infinite series': 'Begalinė eilutė', 'Solve the system': 'Lygčių sistema', 'Complex numbers': 'Kompleksiniai skaičiai', Modulus: 'Modulis',
  'Analyze the function': 'Funkcijos tyrimas', Extrema: 'Ekstremumai', Asymptotes: 'Asimptotės', Domain: 'Apibrėžimo sritis', Range: 'Reikšmių sritis', 'Inverse function': 'Atvirkštinė funkcija',
  'Tangent line': 'Liestinė', 'Derivative at a point': 'Išvestinė taške', 'Partial fractions': 'Paprasčiausios trupmenos', Eigenvalues: 'Tikrinės reikšmės', 'Differential equation': 'Diferencialinė lygtis',
  'Arithmetic sequence': 'Aritmetinė progresija', 'Geometric sequence': 'Geometrinė progresija', 'Arithmetic progression': 'Aritmetinė progresija', 'Geometric progression': 'Geometrinė progresija',
  Probability: 'Tikimybė', Statistics: 'Statistika', Counting: 'Kombinatorika', Arrangements: 'Kėliniai', Speed: 'Greitis', Time: 'Laikas', Distance: 'Kelias', 'Average speed': 'Vidutinis greitis',
  'Working together': 'Bendras darbas', 'Percent change': 'Procentinis pokytis', 'Percent increase': 'Padidėjimas procentais', 'Percent decrease': 'Sumažėjimas procentais', 'Compound interest': 'Sudėtinės palūkanos',
  'Largest value': 'Didžiausia reikšmė', 'Smallest value': 'Mažiausia reikšmė', 'Largest and smallest value': 'Didžiausia ir mažiausia reikšmė', Sets: 'Aibės', 'Number of digits': 'Skaitmenų skaičius',
  'Area between curves': 'Plotas tarp kreivių', Motion: 'Judėjimas', Increasing: 'Didėjimo intervalai', Decreasing: 'Mažėjimo intervalai', 'Volume of revolution': 'Sukinio tūris',
  'Rationalize the denominator': 'Iracionalumo panaikinimas', 'Antiderivative through a point': 'Pirmykštė funkcija per tašką', Check: 'Patikrinimas',
  'Percentage of a number': 'Skaičiaus procentai', 'Successive percent changes': 'Keli procentiniai pokyčiai', Concentration: 'Koncentracija', 'Meeting time': 'Susitikimo laikas', 'River current': 'Upės tėkmė', 'Inverse proportion': 'Atvirkštinis proporcingumas',
  'Exponential growth': 'Eksponentinis augimas', 'Counting (order does not matter)': 'Deriniai', 'Counting (order matters)': 'Gretiniai', Mean: 'Vidurkis', 'Consecutive numbers': 'Iš eilės einantys skaičiai', 'Ratio story': 'Santykis', 'Dividing in a ratio': 'Dalijimas santykiu',
  Square: 'Kvadratas', 'Values of a': 'a reikšmės', 'Values of k': 'k reikšmės', 'Definite integrals': 'Apibrėžtiniai integralai', 'Equal percent changes': 'Vienodi procentiniai pokyčiai', Mixture: 'Mišinys', Dilution: 'Skiedimas', 'Net salary': 'Atlyginimas į rankas',
  'Motion towards each other': 'Judėjimas priešpriešais', 'Boat on a river': 'Valtis upėje', 'Planned speed': 'Planuotas greitis', Laps: 'Ratai', 'Infinite geometric progression': 'Be galo mažėjanti geometrinė progresija', 'Cosine rule': 'Kosinusų teorema',
  'Triangle area': 'Trikampio plotas', 'Perpendicular vectors': 'Statmeni vektoriai', 'Largest area': 'Didžiausias plotas', 'Largest volume': 'Didžiausias tūris',
};
export function trKind(t) { if (lang !== 'lt' || !t) return t; if (KIND[t]) return KIND[t]; const m = t.match(/^Solve for (\w+)$/); if (m) return `Spręskite ${m[1]} atžvilgiu`; const d = t.match(/^Derivative \(order (\d)\)$/); if (d) return `${d[1]}-oji išvestinė`; return trStep(t); }
const LABEL = { value: 'reikšmė', amount: 'suma', count: 'kiekis', number: 'skaičius', mean: 'vidurkis', median: 'mediana', mode: 'moda', first: 'pirmas', second: 'antras', smallest: 'mažiausias', new: 'nauja', 'decreased by %': 'sumažėjo %', 'increased by %': 'padidėjo %', current: 'tėkmė', bridge: 'tiltas', width: 'plotis', length: 'ilgis', net: 'į rankas' };
export function trAnswer(tex) { if (lang !== 'lt' || !tex) return tex; return tex.replace(/\\text\{term (\d+)\}/g, '\\text{$1 narys}').replace(/\\text\{([^{}]+)\}/g, (m, w) => (LABEL[w] ? `\\text{${LABEL[w]}}` : m)).replace(/\\text\{no real solutions\}/g, '\\text{realiųjų sprendinių nėra}').replace(/\\text\{no solution\}/g, '\\text{sprendinių nėra}').replace(/\\text\{all real numbers\}/g, '\\text{visi realieji skaičiai}').replace(/\\text\{ or \}|\\;\\text\{or\}\\;/g, '\\;\\text{arba}\\;').replace(/\\text\{or\}/g, '\\text{arba}').replace(/\\text\{and\}/g, '\\text{ir}').replace(/\\text\{(local )?maximum: \}/g, '\\text{didžiausia: }').replace(/\\text\{(local )?minimum: \}/g, '\\text{mažiausia: }').replace(/\\text\{does not exist\}/g, '\\text{neegzistuoja}').replace(/\\text\{diverges\}/g, '\\text{diverguoja}').replace(/\\text\{ at \}/g, '\\text{, kai }');
}
const ERR = [
  [/^I can’t solve this word problem yet.*/, 'Šio žodinio uždavinio dar neišsprendžiu. Užrašykite jį lygtimi arba reiškiniu (pvz., 210/3) ir išspręsiu žingsnis po žingsnio.'],
  [/^Please enter a math problem$/, 'Įveskite uždavinį'], [/^Type a math problem first\.$/, 'Pirmiausia įveskite uždavinį.'], [/^Type a problem first\.$/, 'Pirmiausia įveskite uždavinį.'],
  [/^Sorry, I could not solve that\. Check the problem for typos\.$/, 'Atsiprašau, nepavyko išspręsti. Patikrinkite, ar nėra klaidų.'], [/^Division by zero is undefined$/, 'Dalyba iš nulio neapibrėžta'],
  [/^I don't understand the symbol "(.+)"$/, 'Nesuprantu simbolio „$1“'], [/^Unexpected "(.+)"$/, 'Netikėtas simbolis „$1“'], [/^Missing "\)"$/, 'Trūksta „)“'], [/^The expression ended too early$/, 'Reiškinys nebaigtas'],
];
export function trError(m) { if (lang !== 'lt' || !m) return m; for (const [re, lt] of ERR) if (re.test(m)) return m.replace(re, lt); return m; }

// ---------------- the interface ----------------
const UI = {
  'Take a picture of a math problem': 'Nufotografuokite matematikos uždavinį', 'Circle the problem you want solved': 'Apveskite uždavinį, kurį norite išspręsti', 'Calculator': 'Skaičiuotuvas', 'Write': 'Rašyti',
  'Solution': 'Sprendimas', 'Edit': 'Taisyti', 'Answer': 'Atsakymas', 'Copy': 'Kopijuoti', 'How to solve it': 'Kaip išspręsti', 'Graph': 'Grafikas', 'Close': 'Uždaryti', 'Clear': 'Išvalyti', 'Undo': 'Atšaukti', 'Solve': 'Spręsti',
  'History': 'Istorija', 'Write by hand': 'Rašyti ranka', 'Word problem': 'Žodinis uždavinys', 'Tips': 'Patarimai', 'Got it': 'Supratau', 'Did you mean…?': 'Gal turėjote omenyje…?',
  'Write one problem with your finger, pen or mouse.': 'Parašykite vieną uždavinį pirštu, rašikliu arba pele.',
  'Type or paste a problem in Lithuanian or English · Žodinį uždavinį galite rašyti lietuviškai.': 'Įrašykite arba įklijuokite uždavinį lietuviškai ar angliškai.',
  'Solve anything on your screen': 'Išspręskite bet ką savo ekrane', 'Share screen': 'Bendrinti ekraną', 'Paste screenshot': 'Įklijuoti ekrano kopiją', 'Open image': 'Atidaryti paveikslėlį', 'Use webcam': 'Naudoti kamerą',
  'Angles:': 'Kampai:', 'Radians': 'Radianai', 'Degrees': 'Laipsniai', 'Accurate reader:': 'Tikslus skaitytuvas:', 'On': 'Įjungtas', 'Off': 'Išjungtas', 'AI tutor': 'AI mokytojas', 'New': 'Naujas', 'Ask the AI tutor': 'Klausti AI mokytojo', 'Ask the AI to solve it': 'Paprašyti AI išspręsti', 'Turn on the AI tutor': 'Įjunkite AI mokytoją',
  'The tutor is Claude, an AI by Anthropic. It explains solutions, answers your questions and solves problems the app can\'t, also from photos with figures.': 'Mokytojas – tai Claude, Anthropic sukurtas dirbtinis intelektas. Jis paaiškina sprendimus, atsako į klausimus ir išsprendžia uždavinius, kurių programėlė neišsprendžia, taip pat iš nuotraukų su brėžiniais.',
  'It needs your own API key from': 'Reikia jūsų API rakto iš', '. The key stays only on this device and is sent only to Anthropic. Each question costs a few cents.': '. Raktas lieka tik šiame įrenginyje ir siunčiamas tik Anthropic. Vienas klausimas kainuoja kelis centus.',
  'Remove key': 'Pašalinti raktą', 'Save': 'Išsaugoti', 'About this problem': 'Apie šį uždavinį', 'Problem': 'Uždavinys', 'Ask about this problem…': 'Klauskite apie šį uždavinį…', 'Ask anything about math…': 'Klauskite bet ko apie matematiką…',
  'Explain it more simply': 'Paaiškink paprasčiau', 'Why is this step needed?': 'Kam reikalingas šis žingsnis?', 'Is there another way?': 'Ar yra kitas būdas?', 'Where do students usually go wrong?': 'Kur dažniausiai suklystama?',
  'Solve it step by step': 'Išspręsk žingsnis po žingsnio', 'Give me a hint only': 'Duok tik užuominą', 'Explain derivatives simply': 'Paprastai paaiškink išvestines', 'How do I solve log equations?': 'Kaip spręsti logaritmines lygtis?', 'Give me a VBE-style problem': 'Duok VBE stiliaus uždavinį',
  'Solve the problem in the picture step by step.': 'Išspręsk nuotraukoje esantį uždavinį žingsnis po žingsnio.', '(the answer was cut off)': '(atsakymas nutrūko)', 'That does not look like an Anthropic API key (it starts with sk-ant-).': 'Tai nepanašu į Anthropic API raktą (jis prasideda sk-ant-).',
  'AI tutor is on': 'AI mokytojas įjungtas', 'API key': 'API raktas', 'Key removed': 'Raktas pašalintas',
  'Language:': 'Kalba:', 'Practice': 'Praktika', 'Show solution': 'Rodyti sprendimą', 'Check': 'Tikrinti', 'Next problem': 'Kitas uždavinys', 'Try a similar problem': 'Spręsti panašų uždavinį', 'Similar problem': 'Panašus uždavinys', 'Correct': 'Teisingai', 'Streak': 'Serija', 'Your answer, e.g. x = 2, x = 3': 'Jūsų atsakymas, pvz.: x = 2, x = 3', 'Write the answer first': 'Pirma įrašykite atsakymą', 'Correct! ✓': 'Teisingai! ✓', 'Not quite. Try again or look at the solution.': 'Ne visai. Bandykite dar kartą arba pažiūrėkite sprendimą.', 'No similar problem for this one': 'Panašaus uždavinio sugalvoti nepavyko', 'Math': 'Matematika', 'Take a picture of a word problem': 'Nufotografuokite žodinį uždavinį', 'From photo': 'Iš nuotraukos', 'Reading the text…': 'Skaitau tekstą…', 'Loading the text reader…': 'Įkeliamas teksto skaitytuvas…', 'I could not find any text. Try again closer, with more light.': 'Neradau teksto. Bandykite arčiau ir su daugiau šviesos.', 'Camera not available. Pick a photo below or use the calculator.': 'Kamera nepasiekiama. Pasirinkite nuotrauką apačioje arba naudokite skaičiuotuvą.', 'No camera here. Pick a photo below or use the calculator.': 'Kameros nėra. Pasirinkite nuotrauką apačioje arba naudokite skaičiuotuvą.', 'Camera permission was denied. Allow it in settings, pick a photo below, or use the calculator.': 'Kamera neleidžiama. Leiskite ją nustatymuose, pasirinkite nuotrauką arba naudokite skaičiuotuvą.',
  'That picture could not be opened': 'Nepavyko atidaryti paveikslėlio', 'No picture on the clipboard. Take a screenshot first, then paste.': 'Iškarpinėje nėra paveikslėlio. Pirma padarykite ekrano kopiją, tada įklijuokite.',
  'Press Ctrl+V (or ⌘V) to paste the screenshot': 'Paspauskite Ctrl+V (arba ⌘V), kad įklijuotumėte ekrano kopiją', 'This browser can’t share the screen. Paste a screenshot instead.': 'Ši naršyklė negali bendrinti ekrano. Įklijuokite ekrano kopiją.',
  'Draw a circle around the problem': 'Apveskite uždavinį', 'Circle the problem on the picture': 'Apveskite uždavinį paveikslėlyje', 'Move the frame over the problem': 'Uždėkite rėmelį ant uždavinio',
  'Reading the problem…': 'Skaitau uždavinį…', 'Loading the accurate reader…': 'Įkeliamas tikslus skaitytuvas…', 'Accurate reader unavailable, using the fast one': 'Tikslus skaitytuvas nepasiekiamas, naudojamas greitasis',
  'I could not find any math. Try again closer, with more light.': 'Neradau matematikos. Bandykite arčiau ir su daugiau šviesos.', 'Copied': 'Nukopijuota', 'Type a math problem first.': 'Pirma įrašykite uždavinį.', 'Type a problem first.': 'Pirma įrašykite uždavinį.',
  'Write something first': 'Pirma ką nors parašykite', 'Reading your writing…': 'Skaitau jūsų raštą…', 'Reading…': 'Skaitau…', 'Accurate reader on (downloads once when you next read a photo)': 'Tikslus skaitytuvas įjungtas (atsisiųs vieną kartą, kai skaitysite nuotrauką)',
  'Using the fast reader': 'Naudojamas greitasis skaitytuvas', 'Angles in degrees': 'Kampai laipsniais', 'Angles in radians': 'Kampai radianais', 'English': 'English', 'Lietuvių': 'Lietuvių',
};
const done = new WeakMap();
export function applyUI(root = document.body) {
  const walk = (n) => {
    if (n.nodeType === 3) {
      const orig = done.get(n) ?? n.nodeValue;
      if (!done.has(n)) done.set(n, orig);
      const key = orig.trim();
      if (key && UI[key]) n.nodeValue = lang === 'lt' ? orig.replace(key, UI[key]) : orig;
      return;
    }
    if (n.nodeType !== 1 || /^(SCRIPT|STYLE|MATH-FIELD|TEXTAREA)$/.test(n.tagName) || n.classList?.contains('katex')) return;
    for (const c of n.childNodes) walk(c);
  };
  walk(root);
  document.documentElement.lang = lang;
}
export const ui = (en) => (lang !== 'lt' ? en : UI[en] ?? String(en).replace(/^Could not read that: /, 'Nepavyko perskaityti: '));
