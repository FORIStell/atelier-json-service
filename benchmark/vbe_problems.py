"""Lithuanian state matura (VBE) mathematics exams as a MathBot benchmark.

Source: Nacionalinė švietimo agentūra (nsa.smsm.lt), public exam papers:
  2026 VBE II dalis, išplėstinis kursas (A) and bendrasis kursas (B), pagrindinė sesija (12th grade)
  2020 VBE pagrindinė sesija (covers the 11th and 12th grade programme)
Answers are worked out here with SymPy, independently of MathBot.

Every task has:
  lt    – the task the way it is worded in the exam (formulas typed as plain text)
  math  – the mathematical core a student would type into the calculator (None if the task needs the
          picture, a proof or several steps of reasoning that are not a single calculation)
  kind / expected – how the answer is checked (see run_vbe.mjs)
python vbe_problems.py writes vbe_expected.json."""
import json, math
import sympy as sp
from sympy import sqrt, pi, Rational as R, binomial, log, sin, cos

x, n, a, m, t = sp.symbols('x n a m t', real=True)
PTS = [0.7, 1.3, 2.1]
IPTS = [-3.5, -2, -0.5, 0.5, 1.5, 2.5, 3.5, 6, 8, 40, 60]
T = []


def task(id, topic, lt, math_q, kind, expected, var='x', why=None):
    T.append({'id': id, 'topic': topic, 'lt': lt, 'math': math_q, 'kind': kind, 'expected': expected, 'var': var, 'why': why})


f = lambda e: float(sp.N(e, 15))
EX = lambda e, v=x: [f(e.subs(v, p)) for p in PTS]
IN = lambda rel: [bool(rel.subs(x, p)) for p in IPTS]

# =============================== 2026 A (išplėstinis kursas) ===============================
task('2026A-01', 'Sets', 'Duotos aibės A = {2; 4; 6; 8} ir B = {2; 4; 5; 6; 7}. Raskite šių aibių skirtumą A \\ B.', '{2; 4; 6; 8} \\ {2; 4; 5; 6; 7}', 'setlit', [8])
task('2026A-02', 'Powers', 'Suprastinkite reiškinį m^sqrt(2) : m^(1 - sqrt(2)).', 'simplify m^sqrt(2) / m^(1-sqrt(2))', 'expr', EX(m**(2 * sqrt(2) - 1), m), var='m')
task('2026A-03', 'Probability', 'Atsitiktinio dydžio X skirstinys: P(X=1) = 1/a, P(X=2) = 2/a, P(X=3) = 3/a. Apskaičiuokite a reikšmę.', '1/a + 2/a + 3/a = 1', 'set', [6.0])
task('2026A-04', 'Radicals', 'Panaikinkite iracionalumą trupmenos 2/(4 - sqrt(a)) vardiklyje.', 'rationalize 2/(4 - sqrt(a))', 'expr', EX(2 * (4 + sqrt(a)) / (16 - a), a), var='a')
task('2026A-05', 'Combinatorics', 'Parduotuvėje prekės žymimos triženkliais kodais nuo 100 iki 999 imtinai. Apskaičiuokite, kiek yra tokių triženklių kodų, kurių visi trys skaitmenys skirtingi.', '9*9*8', 'num', [648])
task('2026A-06', 'Trigonometry', '(paveikslas) Vienetinis apskritimas, tangentų tiesė x = 1 ir taškas B(1; -4/3). Nustatykite tg α reikšmę.', None, 'num', [-4 / 3], why='figure')
task('2026A-07', 'Geometry', 'Ritinio šoninio paviršiaus išklotinė yra kvadratas, kurio plotas lygus 36π^2. Apskaičiuokite šio ritinio pagrindo plotą.', 'pi*(sqrt(36pi^2)/(2pi))^2', 'num', [f(9 * pi)])
task('2026A-08', 'Logarithms', 'Yra žinoma, kad a = ln 2, b = ln 3 ir log_4 18 = m + p·b/a. Nustatykite sumos m + p reikšmę.', None, 'num', [1.5], why='reasoning')
task('2026A-09', 'Integrals', 'Raskite funkcijos f(x) = 4x^3 pirmykštę funkciją F(x), jeigu šios pirmykštės funkcijos grafikui priklauso taškas (0; 1).', 'antiderivative of 4x^3 through (0, 1)', 'expr', EX(x**4 + 1))
task('2026A-10', 'Trigonometry', 'Nustatykite x reikšmę, su kuria lygybė 4·arccos(x + 2) = 3π yra teisinga.', '4 arccos(x+2) = 3pi', 'set', [f(-2 - sqrt(2) / 2)])
task('2026A-11.1', 'Inequalities', 'Išspręskite nelygybę |x - 5| > 2.', '|x-5| > 2', 'ineq', IN(sp.Abs(x - 5) > 2))
task('2026A-11.2', 'Inequalities', 'Išspręskite nelygybę 10·lg(100^x) - 1000 < 0.', '10 lg(100^x) - 1000 < 0', 'ineq', IN(x < 50))
task('2026A-12.1', 'Exponential growth', 'Pirmoje terpėje 10 bakterijų, jų skaičius kas 24 valandas padidėja 4 kartus. Kiek bakterijų bus po 10 parų? Atsakymą parašykite a·2^b pavidalu.', '10*4^10', 'num', [10 * 4**10])
task('2026A-12.2', 'Exponential growth', 'Antroje terpėje 10^100 bakterijų, kas valandą sunyksta 9/10 visų bakterijų. Po kelių valandų bus likusi 1 bakterija?', '10^100 * (1/10)^t = 1', 'set', [100.0], var='t')
task('2026A-13', 'Powers', 'Skaičiai a, b, c teigiami, a^2·b^3·c^4 = 5^10 ir a^2·b = 5^6. Apskaičiuokite sandaugos a·b·c reikšmę.', None, 'num', [625], why='reasoning')
task('2026A-14', 'Derivatives', 'Kelio priklausomybę nuo laiko nusako funkcija s(t) = 5t^2 + 40t. Apskaičiuokite momentinį greitį po 2 valandų (t = 2).', 'derivative of 5t^2 + 40t at t = 2', 'num', [60])
task('2026A-15.1', 'Vectors', '(paveikslas) D – kraštinės BC vidurio taškas, AB = a, AC = b. Išreikškite vektorių AD.', None, 'num', [0], why='figure')
task('2026A-15.2', 'Vectors', '(paveikslas) Apskaičiuokite vektorių AD ir BC skaliarinę sandaugą, jeigu AB = 5 ir AC = 9.', None, 'num', [28], why='figure')
task('2026A-16.1', 'Derivatives', 'Kreivė y = sqrt(x + 1) ir tiesė y = 2 susikerta taške A. Parodykite, kad tiesė y = x/4 + 5/4 yra kreivės liestinė taške A.', 'tangent line to sqrt(x+1) at x = 3', 'expr', EX(x / 4 + R(5, 4)))
task('2026A-16.2', 'Integrals', 'Sukinys gautas sukant apie abscisių ašį kreivinę trapeciją, apribotą kreive y = sqrt(x + 1), tiese x = 3 ir abscisių ašimi. Apskaičiuokite sukinio tūrį.', 'integrate from -1 to 3 of pi*(x+1)', 'num', [f(8 * pi)])
task('2026A-17.2', 'Derivatives', 'Nustatykite funkcijos V(α) = 72π·sin^2(α)·cos(α) išvestinę.', 'd/da 72pi sin(a)^2 cos(a)', 'expr', EX(sp.diff(72 * pi * sin(a)**2 * cos(a), a), a), var='a')
task('2026A-17.3', 'Extrema', 'Parodykite, kad V(α) = 72π·sin^2(α)·cos(α) yra didžiausias, kai α = arccos(sqrt(3)/3); α ∈ (0; π/2).', 'maximum of 72pi sin(x)^2 cos(x) on (0, pi/2)', 'max', [f(sp.acos(sqrt(3) / 3))])
task('2026A-18.1', 'Probability', 'Lentynoje 4 matematikos, 3 fizikos ir 1 istorijos knyga. Atsitiktinai paimtos dvi knygos. Tikimybė, kad abi matematikos?', 'nCr(4,2)/nCr(8,2)', 'num', [f(R(3, 14))])
task('2026A-18.2', 'Probability', 'Du vaikinai paeiliui paima po vieną knygą ir grąžina. Tikimybė, kad abiejų knygos to paties dalyko?', '(4/8)^2 + (3/8)^2 + (1/8)^2', 'num', [f(R(13, 32))])
task('2026A-18.3', 'Probability', 'Urtė atsitiktinai paėmė tris knygas. Tikimybė, kad bent viena matematikos?', '1 - nCr(4,3)/nCr(8,3)', 'num', [f(R(13, 14))])
task('2026A-19.1', 'Geometry', '(paveikslas) Piramidės SABC visos sienos lygiakraščiai trikampiai, briauna a. Raskite apotemos SH ilgį.', None, 'num', [0], why='figure')
task('2026A-19.2', 'Geometry', '(paveikslas) Nustatykite atstumą tarp prasilenkiančių tiesių AB ir SC.', None, 'num', [0], why='figure')
task('2026A-20.2', 'Number theory', 'Remdamiesi lygybe 2a(a - 1) = (a + b)(a + b - 1), nustatykite, kiek mažiausiai mėlynų kamuoliukų (b lyginis, b ≥ 2) gali būti.', None, 'num', [6], why='reasoning')

# =============================== 2026 B (bendrasis kursas) ===============================
task('2026B-01', 'Sets', 'Duotos dvi aibės A = {1; 4; 9; 16} ir B = {9; 16; 25}. Raskite šių aibių sankirtą A ∩ B.', '{1; 4; 9; 16} ∩ {9; 16; 25}', 'setlit', [9, 16])
task('2026B-02', 'Powers', 'Nustatykite a reikšmę, su kuria lygybė 4^(2/3) = root(3, a) yra teisinga.', '4^(2/3) = root(3, a)', 'set', [16.0], var='a')
task('2026B-03', 'Equations', 'Nustatykite, kiek sprendinių turi lygtis x + 2 = 2/x.', 'x + 2 = 2/x', 'count', [2])
task('2026B-04', 'Trigonometry', '(paveikslas) Vienetinis apskritimas ir posūkio kampas α. Nustatykite α (laipsniais).', None, 'num', [0], why='figure')
task('2026B-05', 'Arithmetic', 'Apskaičiuokite reiškinio 10·sqrt((-10)^2) - |-10| reikšmę.', '10 sqrt((-10)^2) - |-10|', 'num', [90])
task('2026B-06', 'Functions', 'Nustatykite funkcijos f(x) = sqrt(2x + 14) apibrėžimo sritį.', 'domain of sqrt(2x+14)', 'ineq', IN(x >= -7))
task('2026B-07', 'Radicals', 'Panaikinkite iracionalumą trupmenos 3/(sqrt(5) + 1) vardiklyje.', '3/(sqrt(5)+1)', 'num', [f(3 * (sqrt(5) - 1) / 4)])
task('2026B-08', 'Trigonometry', 'Yra žinoma, kad sin^2(α) = 0,2. Apskaičiuokite cos^2(α).', '1 - 0.2', 'num', [0.8])
task('2026B-09', 'Combinatorics', 'Šachmatų turnyre dalyvavo 24 šachmatininkai, kiekvienas su kiekvienu sužaidė po vieną partiją. Kiek partijų buvo sužaista?', 'nCr(24, 2)', 'num', [276])
task('2026B-10', 'Geometry', '(paveikslas) Kubo briaunos, prasilenkiančios su tiese CC1.', None, 'num', [0], why='figure')
task('2026B-11.1', 'Equations', 'Išspręskite lygtį -3x^3 = 375.', '-3x^3 = 375', 'set', [-5.0])
task('2026B-11.2', 'Logarithms', 'Išspręskite lygtį log_2(2x - 6) = log_2 8.', 'log(2, 2x-6) = log(2, 8)', 'set', [7.0])
task('2026B-11.3', 'Exponents', 'Išspręskite lygtį 2^x + 2^(x+3) = 36.', '2^x + 2^(x+3) = 36', 'set', [2.0])
task('2026B-11.4', 'Trig equations', 'Išspręskite lygtį tg x - 1 = 0, kai x ∈ (90°; 270°).', 'tan(x) - 1 = 0, 90° < x < 270°', 'set', [225.0])
task('2026B-12.1', 'Sequences', 'Pirmą sekmadienį Rimas įdėjo 12 eurų, o kiekvieną kitą – 3 eurais daugiau. Kiek eurų jis įdėjo 5-ą sekmadienį?', '12, 15, 18, ... nth term', 'nth', [5, 24.0], var='n')
task('2026B-12.2', 'Sequences', 'Kiek eurų Rimas sutaupė per pirmus 8 sekmadienius (12, 15, 18, ...)?', '12 + 15 + 18 + ... + 33', 'num', [180])
task('2026B-12.3', 'Sequences', 'Kelintą sekmadienį Rimas pirmą kartą įdėjo triženklę eurų sumą?', None, 'num', [31], why='reasoning')
task('2026B-13.1', 'Geometry', 'Taisyklingosios keturkampės piramidės pagrindo įstrižainė BD = 24, šoninė briauna ED = 13. Apskaičiuokite aukštinės EO ilgį.', 'sqrt(13^2 - 12^2)', 'num', [5])
task('2026B-13.3', 'Geometry', 'Apskaičiuokite kampo tarp šoninės briaunos ir pagrindo plokštumos kosinusą.', '12/13', 'num', [f(R(12, 13))])
task('2026B-14', 'Logarithms', 'Bakterijų skaičius n = 5 + 15/(1 + 0,2·log_2(t + 1)). Kiek per pirmąsias 7 paras sumažėjo bakterijų skaičius?', '(5 + 15/(1 + 0.2 log(2, 0+1))) - (5 + 15/(1 + 0.2 log(2, 7+1)))', 'num', [5.625])
task('2026B-15', 'Geometry', 'Ritinio ašinio pjūvio įstrižainė 37, pagrindo spindulys 6. Apskaičiuokite ritinio tūrį.', 'pi*6^2*sqrt(37^2 - 12^2)', 'num', [f(1260 * pi)])
task('2026B-16.2', 'Derivatives', 'Raskite funkcijos S(x) = 10x - 2x^2 išvestinę.', 'd/dx 10x - 2x^2', 'expr', EX(10 - 4 * x))
task('2026B-16.3', 'Extrema', 'Koks turėtų būti x, kad plotas S(x) = 10x - 2x^2 būtų didžiausias; x ∈ (0; 5)?', 'maximum of 10x - 2x^2 on (0, 5)', 'max', [2.5])
task('2026B-16.4', 'Extrema', 'Apskaičiuokite didžiausią galimą ploto S(x) = 10x - 2x^2 reikšmę.', 'maximum of 10x - 2x^2 on (0, 5)', 'maxval', [12.5])
task('2026B-17.2', 'Probability', '10 matematikos ir n istorijos knygų. Tikimybė, kad paimta knyga istorijos, lygi 0,6. Kiek iš viso knygų?', 'n/(10+n) = 0.6', 'set', [15.0], var='n', why=None)
task('2026B-17.3', 'Probability', 'Iš lentynos (10 matematikos, 15 istorijos) paimamos dvi knygos. Tikimybė, kad viena matematikos, kita istorijos?', '10*15/nCr(25,2)', 'num', [0.5])
task('2026B-18', 'Logarithms', 'Yra žinoma, kad a = 2^m. Nustatykite, kam lygu log_2(1/a).', 'simplify log(2, 1/2^m)', 'expr', EX(-m, m), var='m')
task('2026B-19', 'Derivatives', 'Funkcijos f(x) = x^3/3 - 7x^2/2 + 13x - 5 grafiko liestinė taške A su Ox ašimi sudaro 45° kampą. Nustatykite visas x0 reikšmes.', "x^2 - 7x + 13 = 1", 'set', [3.0, 4.0])

# =============================== 2020 VBE ===============================
task('2020-01', 'Powers', 'Suprastinkite 25^2020 / 5.', '25^2020/5', 'power', ['5', 4039])
task('2020-02', 'Combinatorics', '3 parkus reikia sutvarkyti per pirmąsias penkias savaitės dienas, po vieną dieną kiekvienam. Keliais būdais galima sudaryti grafiką?', 'nPr(5, 3)', 'num', [60])
task('2020-03', 'Algebra', 'Kai x ≠ -3 ir x ≠ 3, tai x/(x - 3) - (x - 1)/(x + 3) =', 'simplify x/(x-3) - (x-1)/(x+3)', 'expr', EX((7 * x - 3) / (x**2 - 9)))
task('2020-04', 'Algebra', 'Nupirkta a knygų po b eurų ir b knygų po a eurų. Vidutinė vienos knygos kaina?', None, 'num', [0], why='reasoning')
task('2020-05', 'Geometry', '(paveikslas) Taškas B priklauso pusapskritimiui, AB = AO. Kampas BAC = ?', None, 'num', [60], why='figure')
task('2020-06', 'Functions', 'Jeigu funkcijos f(x) = (x + 5)/(2x + a) apibrėžimo sritis yra (-∞; 4) ∪ (4; +∞), tai a = ?', '2*4 + a = 0', 'set', [-8.0], var='a')
task('2020-08', 'Trigonometry', 'Funkcijos f(x) = 3sin(2x) + 2 reikšmių sritis yra:', 'range of 3sin(2x) + 2', 'interval', [-1, 5])
task('2020-09', 'Derivatives', 'Funkcijos f(x) = e^(x^2) išvestinė yra:', 'd/dx e^(x^2)', 'expr', EX(2 * x * sp.exp(x**2)))
task('2020-10', 'Logarithms', 'Apskaičiuokite log_a 8 · log_2 a (a > 0, a ≠ 1).', 'simplify log(a, 8) * log(2, a)', 'expr', [3.0, 3.0, 3.0], var='a')
task('2020-11.1', 'Statistics', 'Mokinių apsilankymai teatre: 1 kartą – 8 mokiniai, 2 kartus – 11, x kartų – 6. Vidurkis 2,4. Apskaičiuokite x.', '(8*1 + 11*2 + 6x)/25 = 2.4', 'set', [5.0])
task('2020-11.2', 'Probability', 'Tikimybė, kad atsitiktinai pasirinktas mokinys teatre apsilankė ne daugiau kaip 2 kartus (8 + 11 iš 25)?', '(8+11)/25', 'num', [0.76])
task('2020-13.1', 'Trigonometry', 'Pažymėję sin 100° = k, cos^2 100° išreikškite per k.', None, 'num', [0], why='reasoning')
task('2020-14.1', 'Probability', 'Fiksuoto ryšio telefonas suskamba su tikimybe 0,75. Tikimybė, kad nesuskambės?', '1 - 0.75', 'num', [0.25])
task('2020-14.2', 'Probability', 'Tikimybės 0,8 ir 0,75, įvykiai nepriklausomi. Tikimybė, kad suskambės bent vienas telefonas?', '1 - (1-0.8)(1-0.75)', 'num', [0.95])
task('2020-15', 'Algebra', 'Apskaičiuokite a + b, jei ac + ad + bd + bc = 68 ir c + d = 4.', None, 'num', [17], why='reasoning')
task('2020-16', 'Logarithms', 'Apskaičiuokite xy, jei 2^x = 3 ir 3^y = 16.', 'log(2, 3) * log(3, 16)', 'num', [4])
task('2020-18', 'Word problem', 'Treniruotė kainuoja 15 Eur, kas penktai treniruotei taikoma 60 % nuolaida. Kiek daugiausia treniruočių galima apmokėti už 250 Eur?', None, 'num', [18], why='reasoning')
task('2020-19.1', 'Logarithms', 'Išspręskite lygtį log_5(x - 7) = 0.', 'log(5, x-7) = 0', 'set', [8.0])
task('2020-19.2', 'Trig equations', 'Išspręskite lygtį sin x + sin(2x) = 0.', 'sin(x) + sin(2x) = 0', 'trig', [0.0, f(2 * pi / 3), f(pi), f(4 * pi / 3)])
task('2020-20.2', 'Extrema', 'Nustatykite, su kuria x reikšme pelnas P(x) = -x^2 + 8x + 180 bus didžiausias.', 'maximum of -x^2 + 8x + 180 on (0, 18)', 'max', [4.0])
task('2020-21.2', 'Geometry', 'Prizmės pagrindo plotas 9·sqrt(3), aukštinė 6. Piramidės su tuo pačiu pagrindo plotu ir tūriu aukštinė?', '3 * 9 sqrt(3) * 6 / (9 sqrt(3))', 'num', [18])
task('2020-22.1', 'Sequences', 'Trikampis skaičius T_n = 1 + 2 + ... + n. Apskaičiuokite T18.', 'sum k=1 to 18 of k', 'num', [171])
task('2020-22.2', 'Sequences', 'Ar skaičius 7750 yra trikampis skaičius (n(n+1)/2 = 7750)?', 'n(n+1)/2 = 7750', 'set', [-125.0, 124.0], var='n')
task('2020-24', 'Probability', 'Vaikinų 3 kartus daugiau negu merginų. Tikimybė pasirinkti dvi merginas lygi 1/20. Kiek merginų?', 'g(g-1)/(4g(4g-1)) = 1/20', 'set', [4.0], var='g')
task('2020-25', 'Integrals', 'Figūros, ribojamos f(x) = x^5 ir tiesės per O ir A(1; 1), plotas lygus trečdaliui stačiakampio ploto (a = 1).', 'integrate from 0 to 1 of (x - x^5)', 'num', [f(R(1, 3))])

json.dump({'points': PTS, 'ipoints': IPTS, 'tasks': T}, open(__file__.replace('vbe_problems.py', 'vbe_expected.json'), 'w'), indent=1, ensure_ascii=False)
print(len(T), 'tasks,', sum(1 for t in T if t['math']), 'with a typed math core')
