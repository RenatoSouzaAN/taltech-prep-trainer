import json
V = [
# set 1
(1,"abate","to become less intense or widespread","diminuir, abrandar","The storm finally began to abate after midnight."),
(1,"aberrant","departing from an accepted standard or normal type","anômalo, aberrante","The lab reran the test because one result was clearly aberrant."),
(1,"alacrity","brisk and cheerful readiness","prontidão entusiasmada","She accepted the invitation with alacrity."),
(1,"ameliorate","to make something bad or unsatisfactory better","melhorar, amenizar","The new policy was meant to ameliorate conditions in overcrowded schools."),
(1,"anomaly","something that deviates from what is standard or expected","anomalia","A warm day in the middle of a cold winter is an anomaly."),
(1,"assuage","to make an unpleasant feeling less intense","aliviar, apaziguar","Nothing the doctor said could assuage his fears."),
(1,"audacious","showing a willingness to take bold risks","audacioso, ousado","The startup's audacious plan surprised even its investors."),
(1,"austere","severe or strict in manner; plain and without decoration","austero, sóbrio","The monks lived in austere rooms with no furniture but a bed."),
(1,"banal","so lacking in originality as to be obvious and boring","banal, trivial","The film's dialogue was so banal that the audience laughed at it."),
(1,"belie","to give a false impression of; to contradict","desmentir, disfarçar","His relaxed smile belied the stress he was under."),
(1,"bolster","to support or strengthen","reforçar, sustentar","New data bolstered the researchers' hypothesis."),
(1,"candor","the quality of being open and honest","franqueza, sinceridade","I appreciated the candor of her feedback."),
(1,"capricious","given to sudden and unaccountable changes of mood or behavior","caprichoso, volúvel","The team struggled under a capricious manager who changed priorities daily."),
(1,"castigate","to criticize or reprimand severely","repreender duramente","The editorial castigated the government for its slow response."),
(1,"cogent","clear, logical, and convincing","convincente, consistente","She made a cogent case for extending the deadline."),
# set 2
(2,"conciliatory","intended to placate or pacify","conciliador","After the argument, he sent a conciliatory message."),
(2,"corroborate","to confirm or give support to a statement, theory, or finding","corroborar, confirmar","Two witnesses corroborated the driver's account."),
(2,"deride","to express contempt for; to ridicule","ridicularizar, zombar","Critics derided the proposal as unrealistic."),
(2,"diatribe","a forceful and bitter verbal attack","diatribe, ataque verbal","The speech turned into a diatribe against the media."),
(2,"diffident","modest or shy because of a lack of self-confidence","tímido, inseguro","The diffident student rarely spoke in class."),
(2,"disparate","essentially different in kind; not easily compared","díspar, heterogêneo","The book connects disparate fields such as biology and economics."),
(2,"dogmatic","inclined to present opinions as undeniably true","dogmático","His dogmatic attitude made discussion impossible."),
(2,"eclectic","drawing ideas or style from a broad and diverse range of sources","eclético","Her playlist is eclectic, mixing jazz, samba and metal."),
(2,"efficacy","the ability to produce a desired or intended result","eficácia","Trials are testing the efficacy of the new vaccine."),
(2,"enervate","to cause someone to feel drained of energy","enfraquecer, esgotar","The heat enervated the hikers. (Atenção: NÃO significa 'energizar'.)"),
(2,"ephemeral","lasting for a very short time","efêmero, passageiro","Social media fame is often ephemeral."),
(2,"equivocate","to use ambiguous language to conceal the truth or avoid commitment","usar evasivas, tergiversar","When asked about the budget, the minister equivocated."),
(2,"erudite","having or showing great knowledge or learning","erudito","The professor gave an erudite lecture on medieval law."),
(2,"exacerbate","to make a problem or bad situation worse","agravar, piorar","Cutting staff would only exacerbate the delays."),
(2,"extol","to praise enthusiastically","exaltar, enaltecer","The review extolled the restaurant's desserts."),
# set 3
(3,"fastidious","very attentive to accuracy and detail; hard to please","meticuloso, exigente","A fastidious editor, she checked every comma."),
(3,"garrulous","excessively talkative, especially about trivial matters","tagarela","The garrulous passenger talked for the entire flight."),
(3,"gregarious","fond of company; sociable","sociável, gregário","Gregarious people often enjoy working in teams."),
(3,"hackneyed","overused and therefore lacking freshness (of a phrase or idea)","batido, clichê","The essay was full of hackneyed expressions."),
(3,"iconoclast","a person who attacks cherished beliefs or institutions","iconoclasta","As an iconoclast, the economist challenged every accepted model."),
(3,"impetuous","acting quickly without thought or care","impetuoso, precipitado","His impetuous decision to quit cost him dearly."),
(3,"innocuous","not harmful or offensive","inofensivo, inócuo","What seemed an innocuous comment upset the client."),
(3,"laconic","using very few words","lacônico","Her laconic reply was simply 'No.'"),
(3,"laud","to praise highly, especially in public","louvar, elogiar","The mayor lauded the volunteers for their work."),
(3,"mitigate","to make less severe, serious, or painful","mitigar, atenuar","Planting trees can mitigate the effects of urban heat."),
(3,"obdurate","stubbornly refusing to change one's opinion or course of action","obstinado, inflexível","The obdurate landlord refused every request for repairs."),
(3,"obsequious","excessively eager to please or obey","servil, bajulador","The obsequious waiter laughed at all of the manager's jokes."),
(3,"opaque","not able to be seen through; difficult to understand","opaco, obscuro","The contract's language was deliberately opaque."),
(3,"paucity","the presence of something in only small or insufficient quantities","escassez","A paucity of data made the conclusion uncertain."),
(3,"perfunctory","carried out with minimal effort or reflection","superficial, feito por obrigação","He gave the report a perfunctory glance and signed it."),
# set 4
(4,"placate","to make someone less angry or hostile","aplacar, acalmar","The company offered refunds to placate angry customers."),
(4,"pragmatic","dealing with things sensibly and realistically","pragmático","We need a pragmatic solution, not a perfect one."),
(4,"prodigal","spending money or resources freely and recklessly","pródigo, esbanjador","The prodigal heir spent his fortune in two years."),
(4,"propensity","an inclination or natural tendency to behave in a particular way","propensão, tendência","He has a propensity to exaggerate."),
(4,"prosaic","lacking poetic beauty or imagination; commonplace","prosaico, sem graça","The truth behind the legend was quite prosaic."),
(4,"quiescent","in a state of inactivity or dormancy","inativo, adormecido","The volcano has been quiescent for centuries."),
(4,"recalcitrant","having an uncooperative attitude toward authority or discipline","recalcitrante, rebelde","The recalcitrant student ignored every warning."),
(4,"reticent","not revealing one's thoughts or feelings readily","reservado, calado","She was reticent about her plans after graduation."),
(4,"sanction","official permission or approval; also, a penalty for breaking a rule","sanção (aprovação OU penalidade)","The trip had the sanction of the school board. (Palavra com dois sentidos opostos.)"),
(4,"soporific","tending to induce drowsiness or sleep","soporífero, sonolento","The lecturer's soporific voice put half the class to sleep."),
(4,"tacit","understood or implied without being stated","tácito, implícito","There was a tacit agreement not to discuss politics at dinner."),
(4,"tenuous","very weak or slight","tênue, frágil","The link between the two events is tenuous."),
(4,"vacillate","to waver between different opinions or actions","vacilar, hesitar","She vacillated between studying law and medicine."),
(4,"venerate","to regard with great respect","venerar, reverenciar","The scientist is venerated by her former students."),
(4,"zealous","having or showing great energy or enthusiasm for a cause","zeloso, fervoroso","The zealous volunteers worked through the night."),
]
vocab=[{"id":f"v{i+1}","set":s,"word":w,"definition":d,"pt":pt,"example":ex} for i,(s,w,d,pt,ex) in enumerate(V)]
assert len(vocab)==60 and all(sum(1 for v in vocab if v["set"]==k)==15 for k in (1,2,3,4))

TC=[ # (set,type,sentence,options,answers,explanation_pt)
(1,"TC","Although the senator's speech was praised for its ___ reasoning, critics noted that it relied on a single outdated study.",["cogent","banal","capricious","aberrant","austere"],["cogent"],"'Although' opõe o elogio à crítica; o elogio pede algo positivo sobre o raciocínio: cogent (convincente)."),
(1,"SE","The new manager's ___ approach surprised the staff, who had expected someone far more cautious.",["audacious","daring","austere","diffident","banal","candid"],["audacious","daring"],"O contraste com 'far more cautious' pede 'ousado': audacious e daring formam frases equivalentes."),
(1,"TC","Far from ___ the tension, the mediator's blunt remarks only intensified it.",["assuaging","bolstering","castigating","belying","corroborating"],["assuaging"],"'Far from X… only intensified' = X é o oposto de intensificar: assuaging (aliviar)."),
(1,"SE","Her calm voice ___ the panic she felt; no one in the audience suspected how nervous she was.",["belied","masked","revealed","betrayed","bolstered","abated"],["belied","masked"],"Ninguém percebeu o nervosismo, então a voz escondeu o pânico: belied e masked. Revealed/betrayed é o par-armadilha (sentido oposto)."),
(2,"TC","Visitors found the exhibition ___: it combined Renaissance portraits, street art and video installations.",["eclectic","dogmatic","diffident","ephemeral","erudite"],["eclectic"],"Os dois-pontos explicam a palavra: fontes muito variadas = eclectic."),
(2,"SE","The fame of most viral videos is ___; within a week, few people remember them.",["ephemeral","fleeting","enduring","erudite","disparate","conciliatory"],["ephemeral","fleeting"],"'Em uma semana ninguém lembra' = dura pouco: ephemeral e fleeting."),
(2,"TC","Rather than offering a clear answer, the spokesperson continued to ___, leaving reporters more confused than before.",["equivocate","extol","corroborate","deride","exacerbate"],["equivocate"],"'Rather than a clear answer' + repórteres confusos = falar de forma ambígua: equivocate."),
(2,"SE","Cutting the maintenance budget will only ___ the problems with the city's aging bridges.",["exacerbate","aggravate","alleviate","extol","corroborate","deride"],["exacerbate","aggravate"],"'Will only ___ the problems' com corte de verba = piorar: exacerbate e aggravate."),
(3,"TC","Known for his ___ replies, the coach rarely said more than a few words to reporters.",["laconic","garrulous","gregarious","obsequious","impetuous"],["laconic"],"'Rarely said more than a few words' define laconic. Garrulous é o oposto."),
(3,"SE","Despite the new evidence, the committee remained ___, refusing to reconsider its decision.",["obdurate","adamant","innocuous","perfunctory","gregarious","flexible"],["obdurate","adamant"],"'Refusing to reconsider' = inflexível: obdurate e adamant."),
(3,"TC","The inspector's review was so ___ that she missed several obvious safety violations.",["perfunctory","fastidious","opaque","hackneyed","iconoclastic"],["perfunctory"],"Deixar passar problemas óbvios = revisão feita sem cuidado: perfunctory. Fastidious seria o contrário."),
(3,"SE","The speech was full of ___ phrases such as 'think outside the box', which bored the audience.",["hackneyed","clichéd","innovative","laconic","opaque","innocuous"],["hackneyed","clichéd"],"O exemplo é um clichê que entediou o público: hackneyed e clichéd."),
(4,"TC","The lecture was so ___ that several students struggled to stay awake.",["soporific","zealous","recalcitrant","pragmatic","tenuous"],["soporific"],"'Struggled to stay awake' = que dá sono: soporific."),
(4,"SE","The connection between the two events is ___ at best; the evidence linking them is extremely thin.",["tenuous","flimsy","robust","tacit","prosaic","zealous"],["tenuous","flimsy"],"'Evidence extremely thin' = ligação fraca: tenuous e flimsy."),
(4,"TC","The partners never signed a contract, but they had a ___ agreement that each would cover half the costs.",["tacit","prodigal","quiescent","reticent","recalcitrant"],["tacit"],"Acordo existente sem nada escrito ou dito = tacit."),
(4,"SE","Unable to choose between the two job offers, Marta continued to ___ for weeks.",["vacillate","waver","venerate","placate","decide","sanction"],["vacillate","waver"],"'Unable to choose' = hesitar entre opções: vacillate e waver."),
]
sentence_items=[{"id":f"s{i+1}","set":s,"type":t,"sentence":q,"options":o,"answers":a,"explanation":e} for i,(s,t,q,o,a,e) in enumerate(TC)]
for it in sentence_items:
    assert all(a in it["options"] for a in it["answers"]); assert len(it["answers"])==(2 if it["type"]=="SE" else 1)

QC=["Quantity A is greater","Quantity B is greater","The two quantities are equal","The relationship cannot be determined from the information given"]
quant=[
{"id":"q1","type":"QC","prompt":"Quantity A: 3/7   |   Quantity B: 0.43","options":QC,"answer":"Quantity B is greater","solution":"3/7 ≈ 0.4286 < 0.43."},
{"id":"q2","type":"QC","prompt":"x > 0.   Quantity A: x²   |   Quantity B: x","options":QC,"answer":"The relationship cannot be determined from the information given","solution":"x = 2 → A maior (4 > 2); x = 0.5 → B maior (0.25 < 0.5). Depende de x."},
{"id":"q3","type":"QC","prompt":"Quantity A: the average (arithmetic mean) of 4, 8 and 12   |   Quantity B: the median of 3, 8 and 20","options":QC,"answer":"The two quantities are equal","solution":"Média = 24/3 = 8; mediana = 8."},
{"id":"q4","type":"QC","prompt":"Quantity A: 20% of 150   |   Quantity B: 25% of 110","options":QC,"answer":"Quantity A is greater","solution":"A = 30; B = 27.5."},
{"id":"q5","type":"QC","prompt":"Quantity A: (0.9)²   |   Quantity B: 0.9","options":QC,"answer":"Quantity B is greater","solution":"0.9² = 0.81. Número entre 0 e 1 elevado ao quadrado diminui."},
{"id":"q6","type":"MC","prompt":"If 3x − 7 = 11, what is the value of x?","options":["4","5","6","7","8"],"answer":"6","solution":"3x = 18 → x = 6."},
{"id":"q7","type":"MC","prompt":"The price of a jacket is increased by 20% and then the new price is decreased by 20%. The final price is what percent of the original price?","options":["96%","98%","100%","102%","104%"],"answer":"96%","solution":"1.2 × 0.8 = 0.96 → 96% (queda líquida de 4%)."},
{"id":"q8","type":"MC","prompt":"A rectangle has a perimeter of 30 and a length of 9. What is its area?","options":["45","54","63","81","135"],"answer":"54","solution":"2(9 + w) = 30 → w = 6; área = 9 × 6 = 54."},
{"id":"q9","type":"MC","prompt":"How many integers from 10 to 50, inclusive, are divisible by 6?","options":["5","6","7","8","9"],"answer":"7","solution":"12, 18, 24, 30, 36, 42, 48 → 7."},
{"id":"q10","type":"MC","prompt":"A right triangle has legs of length 6 and 8. What is the length of the hypotenuse?","options":["9","10","12","14","√48"],"answer":"10","solution":"√(36 + 64) = √100 = 10."},
{"id":"q11","type":"MC","prompt":"If 2^x = 32, what is the value of 2^(x − 2)?","options":["4","8","16","30","64"],"answer":"8","solution":"x = 5 → 2³ = 8 (ou 32/4 = 8)."},
{"id":"q12","type":"NE","prompt":"The average of five numbers is 12. Four of the numbers are 10, 14, 9 and 15. What is the fifth number?","accept":["12"],"answer":"12","solution":"Soma total = 5 × 12 = 60; 10+14+9+15 = 48; 60 − 48 = 12."},
{"id":"q13","type":"NE","prompt":"Pipe A fills a tank in 3 hours and pipe B fills it in 6 hours. Working together, how many hours do they take to fill the tank?","accept":["2"],"answer":"2","solution":"1/3 + 1/6 = 1/2 do tanque por hora → 2 horas."},
{"id":"q14","type":"NE","prompt":"Two fair coins are tossed. What is the probability that both land heads? (Give a fraction or decimal.)","accept":["1/4","0.25",".25"],"answer":"1/4","solution":"(1/2) × (1/2) = 1/4."},
{"id":"q15","type":"NE","prompt":"A car travels 150 kilometers in 2.5 hours at a constant speed. What is its speed, in kilometers per hour?","accept":["60"],"answer":"60","solution":"150 ÷ 2.5 = 60 km/h."},
]
issues=[x for x in json.load(open('/tmp/issues.json')) if len(x["instructions"])<=360][:12]

data={
 "meta":{"title":"Treino TalTech: GRE + TOEFL","version":1,"updated":"2026-11-02",
   "note":"Vocab, SE/TC, quant, TOEFL writing and speaking prompts are original practice items (not ETS items). GRE Issue prompts are quoted verbatim from the official ETS Issue pool (https://www.ets.org/pdfs/gre/issue-pool.pdf). Rubric summaries from ETS scoring guides."},
 "vocab":vocab,"vocabSentences":sentence_items,"quant":quant,
 "greIssue":{"minutes":30,"source":"ETS, GRE Analytical Writing 'Analyze an Issue' Topic Pool, https://www.ets.org/pdfs/gre/issue-pool.pdf","prompts":issues,
   "rubric6":["articulates a clear and insightful position on the issue in accordance with the assigned task","develops the position fully with compelling reasons and/or persuasive examples","sustains a well-focused, well-organized analysis, connecting ideas logically","conveys ideas fluently and precisely, using effective vocabulary and sentence variety","demonstrates superior facility with the conventions of standard written English (i.e., grammar, usage and mechanics), but may have minor errors"],
   "rubric4":["presents a clear position on the issue in accordance with the assigned task","develops the position with relevant reasons and/or examples","is adequately focused and organized","demonstrates sufficient control of language to express ideas with acceptable clarity","generally demonstrates control of the conventions of standard written English, but may have some errors"],
   "rubricSource":"https://www.ets.org/gre/test-takers/general-test/prepare/content/analytical-writing/scoring.html"},
 "toeflWriting":{
   "sectionMinutes":23,"sectionItems":12,
   "buildSentence":{"items":10,"note":"10 itens, 1 ponto cada; tempo próprio não informado no material oficial (o resto da seção de ~23 min).","practice":[
     {"context":"Why were you late this morning?","chunks":["did not","I usually take","come","the bus","that","does"],"answer":"The bus that I usually take did not come.","extra":"does"},
     {"context":"Are you joining the study group tonight?","chunks":["where","is meeting","you","the group","know","do","are"],"answer":"Do you know where the group is meeting?","extra":"are"},
     {"context":"I just moved to a new apartment.","chunks":["far","the university","is","how","from","it"],"answer":"How far is it from the university?","extra":None},
     {"context":"What did the professor say about the exam?","chunks":["it","five chapters","she told us","would cover","that","the first","will"],"answer":"She told us that it would cover the first five chapters.","extra":"will"},
     {"context":"The conference starts tomorrow.","chunks":["begins","what time","could you","the first session","tell me","does"],"answer":"Could you tell me what time the first session begins?","extra":"does"}]},
   "email":{"minutes":7,"practice":[
     {"situation":"You signed up for a weekend photography course at your local community center. Yesterday, the center moved the class from Saturday morning to Thursday evening, when you have to work.","to":"coordinator@riversidecommunitycenter.org","subject":"Schedule change for the photography course","bullets":["Explain why you signed up for the course.","Describe the problem the schedule change causes for you.","Ask about your options."]},
     {"situation":"Last week a classmate lent you an expensive textbook. While you were studying at a café, you spilled coffee on it and several pages were damaged.","to":"daniel.kim@university.edu","subject":"About your textbook","bullets":["Apologize and explain what happened.","Offer a solution.","Suggest a time and place to meet."]}]},
   "discussion":{"minutes":10,"minWords":100,"practice":[
     {"professor":"Your professor is teaching a class on urban planning. Professor: Many cities in Europe have turned their historic centers into pedestrian-only zones. Supporters say this makes cities cleaner and safer; opponents say it hurts businesses and makes life harder for some residents. Should cities ban private cars from their central areas? Why or why not?","students":[{"name":"Ana","post":"Yes. Car-free centers have less pollution and fewer accidents. When my city closed its main avenue to cars on Sundays, local shops were actually busier because people walked around more."},{"name":"Kevin","post":"I disagree. Elderly people and people with disabilities depend on cars, and shops still need deliveries. A total ban would make the center less accessible, not more."}]},
     {"professor":"Your professor is teaching a class on business management. Professor: Several companies have experimented with a four-day workweek while keeping salaries the same. Should more companies adopt a four-day workweek? Why or why not?","students":[{"name":"Priya","post":"I think so. Rested employees are more focused, and companies that tried it reported similar productivity with fewer sick days."},{"name":"Lucas","post":"It depends on the industry. A hospital or a customer support center can't just close one day a week, so it might be unfair or impossible for many workers."}]}]},
   "rubricEmail5":["Elaboration that effectively supports the communicative purpose","Effective syntactic variety and precise, idiomatic word choice","Consistent use of appropriate social conventions (politeness, register, organization of information, requests, refusals, etc.)","Almost no lexical or grammatical errors other than those expected from a competent writer under timed conditions"],
   "rubricDiscussion5":["Relevant and well-elaborated explanations, exemplifications and/or details","Effective use of a variety of syntactic structures and precise, idiomatic word choice","Almost no lexical or grammatical errors other than those expected from a competent writer under timed conditions"],
   "source":"ETS TOEFL iBT Writing Scoring Guide (writing-rubrics.pdf); Updated TOEFL iBT Test Overview; Full-Length Practice Test 1"},
 "toeflSpeaking":{"sectionMinutes":8,"sectionItems":11,
   "listenRepeat":{"responseSeconds":"8–12","prep":0,"practice":[
     {"scenario":"You are training to give campus tours. Listen to your supervisor and repeat what she says. Repeat only once.","sentences":["Welcome to the campus.","The library is on your left.","Students can borrow laptops at the front desk.","The cafeteria closes at eight on weekdays and at six on weekends.","If you lose your ID card, report it to the security office right away.","The building that you see across the street was designed by a former student.","Visitors who would like to attend a lecture should register online at least one day in advance."]},
     {"scenario":"You are volunteering at a science museum. Listen to the coordinator and repeat what he says. Repeat only once.","sentences":["Tickets are sold at the main entrance.","Please keep your bags in the lockers.","The dinosaur exhibit is on the second floor.","Photography is allowed, but please turn off your flash.","Guided tours start every hour and last about forty minutes.","Children under twelve must be accompanied by an adult at all times.","The planetarium show, which was updated last year, explains how stars are formed."]}]},
   "interview":{"responseSeconds":45,"prep":0,"practice":[
     {"scenario":"You have agreed to take part in a research study about technology and learning. A researcher will ask you some questions.","questions":["Do you usually study alone, with friends, or online? Tell me a little about how you study.","Some people learn best by watching videos, while others prefer reading. Which do you prefer, and why?","Some people think universities should replace most lectures with online courses. Do you agree? Why or why not?","Researchers predict that AI tutors will become common in the next ten years. Do you think this will improve education? Why or why not?"]},
     {"scenario":"You have agreed to take part in a study about transportation and work. A researcher will ask you some questions.","questions":["How do you usually get to work or school?","What is one thing you would change about public transportation where you live? Why?","Some companies let employees work from home permanently. Do you think this is a good idea? Why or why not?","Some cities are considering charging drivers a fee to enter the city center during busy hours. Do you think this policy would be effective? Why or why not?"]}]},
   "rubricRepeat":{"5":"Exact, fully intelligible repetition","4":"Meaning captured; minor changes (1–2 function words, a related content word, tense/number markers)","3":"Essentially full, but original meaning not accurately captured","2":"Significant part missing and/or highly inaccurate","1":"Very little of the prompt, or largely unintelligible","0":"No response / unintelligible / not English / unrelated"},
   "rubricInterview":{"5":"On topic, well elaborated; good pace; easily intelligible; range of accurate grammar and vocabulary","4":"On topic and elaborated (may lack connectors); generally good pace; occasional words need minor effort; grammar/vocabulary adequate most of the time","3":"Generally on topic, limited elaboration; choppy pace, frequent fillers; intelligibility sometimes affected; limited range","2":"Minimally connected; little relevant elaboration; limited intelligibility","1":"Only vaguely connected; mostly unintelligible; isolated words","0":"No response / unintelligible / not English / unrelated"},
   "source":"ETS TOEFL iBT Speaking Scoring Guide (speaking-rubrics.pdf); Updated TOEFL iBT Test Overview (8–12 s per Listen and Repeat sentence; 4 interview questions, 45 s each; no preparation time)"},
 "milestones":[
   ["S1 · 2–8/nov","Diagnóstico TOEFL (Full-Length Practice Test 1) + agendar o TOEFL"],
   ["S2 · 9–15/nov","Teacher Practice Test 1 (Writing + Speaking) + 3 redações longas"],
   ["S3 · 16–22/nov","Teacher Practice Test 2 completo"],
   ["S4 · 23–29/nov","Teacher Practice Test 3 completo"],
   ["S5 · 30/nov–6/dez","Full-Length Practice Test 2 em condições reais"],
   ["S6 · 7–13/dez","TOEFL (se 13/dez) ou Teacher Practice Test 4"],
   ["S7 · 14–20/dez","TOEFL (se 20/dez) / POWERPREP Online 1"],
   ["S8 · 21–27/dez","Practice Book: Verbal + Issue; ver nota do TOEFL"],
   ["S9 · 28/dez–3/jan","3 Issues de 30 min"],
   ["S10 · 4–10/jan","Practice Book: Quant + 2 Issues; agendar o GRE"],
   ["S11 · 11–17/jan","POWERPREP Online 2 cronometrado"],
   ["S12 · 18–24/jan","GRE ~24/jan (enviar a TalTech, DI 5019)"],
   ["S13 · 25–31/jan","Notas oficiais ~1–3/fev; decidir refação"]],
}
json.dump(data,open('/workspace/treino-app/data.json','w'),ensure_ascii=False,indent=1)
print(len(issues),[i["statement"][:40] for i in issues])
