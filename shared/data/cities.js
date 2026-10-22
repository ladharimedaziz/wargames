// Major cities, shown on the map when the camera zooms in or a country is in focus.
// Columns: name | Arabic name | lat | lon | country (alpha-3) | tier (1 capital or megacity, 2 major city, 3 regional city, 4 town or base shown only close up)
const RAW = `
Riyadh|الرياض|24.71|46.68|SAU|1
Jeddah|جدة|21.49|39.19|SAU|2
Mecca|مكة المكرمة|21.39|39.86|SAU|2
Medina|المدينة المنورة|24.47|39.61|SAU|2
Dammam|الدمام|26.43|50.10|SAU|2
Tabuk|تبوك|28.38|36.57|SAU|3
Abha|أبها|18.22|42.51|SAU|3
NEOM|نيوم|28.00|35.20|SAU|3
Jubail|الجبيل|27.01|49.66|SAU|3
Abu Dhabi|أبوظبي|24.45|54.38|ARE|1
Dubai|دبي|25.20|55.27|ARE|1
Sharjah|الشارقة|25.35|55.42|ARE|3
Doha|الدوحة|25.29|51.53|QAT|1
Kuwait City|مدينة الكويت|29.37|47.98|KWT|1
Manama|المنامة|26.23|50.59|BHR|1
Muscat|مسقط|23.59|58.41|OMN|1
Salalah|صلالة|17.02|54.09|OMN|3
Sanaa|صنعاء|15.37|44.19|YEM|1
Aden|عدن|12.79|45.03|YEM|2
Hodeidah|الحديدة|14.80|42.95|YEM|3
Tehran|طهران|35.69|51.39|IRN|1
Mashhad|مشهد|36.30|59.61|IRN|2
Isfahan|أصفهان|32.65|51.67|IRN|2
Tabriz|تبريز|38.08|46.29|IRN|2
Shiraz|شيراز|29.59|52.58|IRN|2
Bandar Abbas|بندر عباس|27.18|56.27|IRN|2
Bushehr|بوشهر|28.97|50.84|IRN|3
Ahvaz|الأهواز|31.32|48.67|IRN|3
Baghdad|بغداد|33.31|44.37|IRQ|1
Basra|البصرة|30.51|47.81|IRQ|2
Mosul|الموصل|36.34|43.13|IRQ|2
Erbil|أربيل|36.19|44.01|IRQ|2
Damascus|دمشق|33.51|36.29|SYR|1
Aleppo|حلب|36.20|37.16|SYR|2
Latakia|اللاذقية|35.52|35.79|SYR|3
Homs|حمص|34.73|36.71|SYR|3
Amman|عمّان|31.95|35.93|JOR|1
Aqaba|العقبة|29.53|35.01|JOR|3
Beirut|بيروت|33.89|35.50|LBN|1
Jerusalem|القدس|31.78|35.22|ISR|1
Tel Aviv|تل أبيب|32.08|34.78|ISR|2
Haifa|حيفا|32.79|34.99|ISR|3
Eilat|إيلات|29.56|34.95|ISR|3
Gaza|غزة|31.50|34.47|PSE|2
Ramallah|رام الله|31.90|35.20|PSE|3
Cairo|القاهرة|30.04|31.24|EGY|1
Alexandria|الإسكندرية|31.20|29.92|EGY|2
Port Said|بورسعيد|31.26|32.30|EGY|2
Suez|السويس|29.97|32.53|EGY|3
Aswan|أسوان|24.09|32.90|EGY|3
Khartoum|الخرطوم|15.50|32.56|SDN|1
Port Sudan|بورتسودان|19.62|37.22|SDN|2
Tripoli|طرابلس|32.89|13.19|LBY|1
Benghazi|بنغازي|32.12|20.07|LBY|2
Tunis|تونس|36.81|10.18|TUN|1
Algiers|الجزائر|36.75|3.06|DZA|1
Oran|وهران|35.70|-0.63|DZA|2
Rabat|الرباط|34.02|-6.84|MAR|1
Casablanca|الدار البيضاء|33.57|-7.59|MAR|2
Tangier|طنجة|35.76|-5.83|MAR|3
Nouakchott|نواكشوط|18.08|-15.98|MRT|1
Ankara|أنقرة|39.93|32.86|TUR|1
Istanbul|إسطنبول|41.01|28.98|TUR|1
Izmir|إزمير|38.42|27.14|TUR|2
Antalya|أنطاليا|36.90|30.70|TUR|3
Incirlik|إنجرليك|37.00|35.43|TUR|3
Nicosia|نيقوسيا|35.19|33.38|CYP|1
Athens|أثينا|37.98|23.73|GRC|1
Thessaloniki|سالونيك|40.64|22.94|GRC|3
London|لندن|51.51|-0.13|GBR|1
Manchester|مانشستر|53.48|-2.24|GBR|2
Edinburgh|إدنبرة|55.95|-3.19|GBR|2
Portsmouth|بورتسموث|50.82|-1.09|GBR|3
Belfast|بلفاست|54.60|-5.93|GBR|3
Dublin|دبلن|53.35|-6.26|IRL|1
Paris|باريس|48.86|2.35|FRA|1
Marseille|مرسيليا|43.30|5.37|FRA|2
Lyon|ليون|45.76|4.84|FRA|2
Toulon|طولون|43.12|5.93|FRA|3
Brest|بريست|48.39|-4.49|FRA|3
Berlin|برلين|52.52|13.40|DEU|1
Hamburg|هامبورغ|53.55|9.99|DEU|2
Munich|ميونخ|48.14|11.58|DEU|2
Frankfurt|فرانكفورت|50.11|8.68|DEU|2
Ramstein|رامشتاين|49.44|7.60|DEU|3
Amsterdam|أمستردام|52.37|4.90|NLD|1
Rotterdam|روتردام|51.92|4.48|NLD|3
Brussels|بروكسل|50.85|4.35|BEL|1
Luxembourg|لوكسمبورغ|49.61|6.13|LUX|2
Bern|برن|46.95|7.45|CHE|1
Zurich|زيورخ|47.38|8.54|CHE|2
Geneva|جنيف|46.20|6.14|CHE|2
Vienna|فيينا|48.21|16.37|AUT|1
Rome|روما|41.90|12.50|ITA|1
Milan|ميلانو|45.46|9.19|ITA|2
Naples|نابولي|40.85|14.27|ITA|2
Sicily|صقلية|37.60|14.02|ITA|3
Madrid|مدريد|40.42|-3.70|ESP|1
Barcelona|برشلونة|41.39|2.17|ESP|2
Seville|إشبيلية|37.39|-5.98|ESP|3
Rota|روتا|36.62|-6.35|ESP|3
Lisbon|لشبونة|38.72|-9.14|PRT|1
Porto|بورتو|41.15|-8.61|PRT|3
Copenhagen|كوبنهاغن|55.68|12.57|DNK|1
Oslo|أوسلو|59.91|10.75|NOR|1
Bergen|بيرغن|60.39|5.32|NOR|3
Stockholm|ستوكهولم|59.33|18.07|SWE|1
Gothenburg|غوتنبرغ|57.71|11.97|SWE|3
Helsinki|هلسنكي|60.17|24.94|FIN|1
Reykjavik|ريكيافيك|64.15|-21.94|ISL|1
Tallinn|تالين|59.44|24.75|EST|1
Riga|ريغا|56.95|24.11|LVA|1
Vilnius|فيلنيوس|54.69|25.28|LTU|1
Warsaw|وارسو|52.23|21.01|POL|1
Krakow|كراكوف|50.06|19.94|POL|2
Gdansk|غدانسك|54.35|18.65|POL|2
Rzeszow|جيشوف|50.04|22.00|POL|3
Prague|براغ|50.08|14.44|CZE|1
Bratislava|براتيسلافا|48.15|17.11|SVK|1
Budapest|بودابست|47.50|19.04|HUN|1
Bucharest|بوخارست|44.43|26.10|ROU|1
Constanta|كونستانتا|44.18|28.65|ROU|3
Sofia|صوفيا|42.70|23.32|BGR|1
Varna|فارنا|43.21|27.91|BGR|3
Belgrade|بلغراد|44.79|20.45|SRB|1
Zagreb|زغرب|45.81|15.98|HRV|1
Ljubljana|ليوبليانا|46.06|14.51|SVN|1
Sarajevo|سراييفو|43.86|18.41|BIH|1
Podgorica|بودغوريتسا|42.44|19.26|MNE|1
Tirana|تيرانا|41.33|19.82|ALB|1
Skopje|سكوبيه|42.00|21.43|MKD|1
Pristina|بريشتينا|42.66|21.17|XKX|1
Chisinau|كيشيناو|47.01|28.86|MDA|1
Minsk|مينسك|53.90|27.57|BLR|1
Brest|بريست|52.10|23.69|BLR|3
Kyiv|كييف|50.45|30.52|UKR|1
Kharkiv|خاركيف|49.99|36.23|UKR|2
Odesa|أوديسا|46.48|30.73|UKR|2
Dnipro|دنيبرو|48.46|35.05|UKR|2
Lviv|لفيف|49.84|24.03|UKR|2
Zaporizhzhia|زابوريجيا|47.84|35.14|UKR|3
Donetsk|دونيتسك|48.02|37.80|UKR|2
Mariupol|ماريوبول|47.10|37.55|UKR|3
Sevastopol|سيفاستوبول|44.62|33.52|UKR|2
Kherson|خيرسون|46.64|32.62|UKR|3
Moscow|موسكو|55.76|37.62|RUS|1
St Petersburg|سانت بطرسبرغ|59.94|30.31|RUS|1
Novosibirsk|نوفوسيبيرسك|55.01|82.93|RUS|2
Yekaterinburg|يكاترينبورغ|56.84|60.61|RUS|2
Kazan|قازان|55.80|49.11|RUS|2
Rostov-on-Don|روستوف على الدون|47.23|39.72|RUS|2
Volgograd|فولغوغراد|48.71|44.51|RUS|2
Kaliningrad|كالينينغراد|54.71|20.51|RUS|2
Murmansk|مورمانسك|68.97|33.08|RUS|2
Vladivostok|فلاديفوستوك|43.12|131.89|RUS|2
Novorossiysk|نوفوروسيسك|44.72|37.77|RUS|3
Sochi|سوتشي|43.59|39.73|RUS|3
Omsk|أومسك|54.99|73.37|RUS|3
Krasnoyarsk|كراسنويارسك|56.01|92.89|RUS|3
Irkutsk|إيركوتسك|52.29|104.28|RUS|3
Khabarovsk|خاباروفسك|48.48|135.08|RUS|3
Petropavlovsk|بتروبافلوفسك|53.02|158.65|RUS|3
Norilsk|نوريلسك|69.35|88.20|RUS|3
Yakutsk|ياكوتسك|62.03|129.73|RUS|3
Tbilisi|تبليسي|41.72|44.79|GEO|1
Yerevan|يريفان|40.18|44.51|ARM|1
Baku|باكو|40.41|49.87|AZE|1
Astana|أستانا|51.17|71.43|KAZ|1
Almaty|ألماتي|43.24|76.89|KAZ|2
Tashkent|طشقند|41.30|69.24|UZB|1
Samarkand|سمرقند|39.65|66.96|UZB|3
Ashgabat|عشق آباد|37.96|58.33|TKM|1
Bishkek|بيشكك|42.87|74.59|KGZ|1
Dushanbe|دوشنبه|38.56|68.79|TJK|1
Kabul|كابول|34.53|69.17|AFG|1
Kandahar|قندهار|31.61|65.71|AFG|3
Islamabad|إسلام آباد|33.68|73.05|PAK|1
Karachi|كراتشي|24.86|67.01|PAK|1
Lahore|لاهور|31.55|74.34|PAK|2
Peshawar|بيشاور|34.01|71.58|PAK|3
Quetta|كويتا|30.18|66.98|PAK|3
Gwadar|جوادر|25.13|62.32|PAK|3
New Delhi|نيودلهي|28.61|77.21|IND|1
Mumbai|مومباي|19.08|72.88|IND|1
Kolkata|كولكاتا|22.57|88.36|IND|2
Chennai|تشيناي|13.08|80.27|IND|2
Bengaluru|بنغالور|12.97|77.59|IND|2
Hyderabad|حيدر آباد|17.39|78.49|IND|2
Ahmedabad|أحمد آباد|23.02|72.57|IND|3
Srinagar|سريناغار|34.08|74.80|IND|3
Visakhapatnam|فيساكاباتنام|17.69|83.22|IND|3
Kathmandu|كاتماندو|27.72|85.32|NPL|1
Thimphu|تيمفو|27.47|89.64|BTN|1
Dhaka|دكا|23.81|90.41|BGD|1
Chittagong|شيتاغونغ|22.36|91.78|BGD|3
Colombo|كولومبو|6.93|79.86|LKA|1
Male|ماليه|4.18|73.51|MDV|2
Beijing|بكين|39.90|116.40|CHN|1
Shanghai|شنغهاي|31.23|121.47|CHN|1
Guangzhou|غوانغتشو|23.13|113.26|CHN|2
Shenzhen|شنتشن|22.54|114.06|CHN|2
Hong Kong|هونغ كونغ|22.32|114.17|CHN|1
Chongqing|تشونغتشينغ|29.56|106.55|CHN|2
Wuhan|ووهان|30.59|114.31|CHN|2
Chengdu|تشنغدو|30.57|104.07|CHN|2
Xi'an|شيان|34.34|108.94|CHN|2
Tianjin|تيانجين|39.34|117.36|CHN|2
Nanjing|نانجينغ|32.06|118.80|CHN|3
Qingdao|تشينغداو|36.07|120.38|CHN|3
Dalian|داليان|38.91|121.60|CHN|3
Xiamen|شيامن|24.48|118.09|CHN|3
Fuzhou|فوتشو|26.07|119.30|CHN|3
Urumqi|أورومتشي|43.83|87.62|CHN|3
Lhasa|لاسا|29.65|91.12|CHN|3
Harbin|هاربين|45.80|126.53|CHN|3
Kunming|كونمينغ|25.04|102.71|CHN|3
Sanya|سانيا|18.25|109.51|CHN|3
Taipei|تايبيه|25.03|121.57|TWN|1
Kaohsiung|كاوهسيونغ|22.63|120.30|TWN|2
Taichung|تايتشونغ|24.15|120.67|TWN|3
Seoul|سيول|37.57|126.98|KOR|1
Busan|بوسان|35.18|129.08|KOR|2
Incheon|إنتشون|37.46|126.71|KOR|3
Pyongyang|بيونغ يانغ|39.04|125.76|PRK|1
Wonsan|وونسان|39.15|127.44|PRK|3
Tokyo|طوكيو|35.68|139.69|JPN|1
Osaka|أوساكا|34.69|135.50|JPN|2
Nagoya|ناغويا|35.18|136.91|JPN|2
Sapporo|سابورو|43.06|141.35|JPN|3
Fukuoka|فوكوكا|33.59|130.40|JPN|3
Okinawa|أوكيناوا|26.21|127.68|JPN|2
Yokosuka|يوكوسوكا|35.28|139.67|JPN|3
Ulaanbaatar|أولان باتور|47.89|106.91|MNG|1
Hanoi|هانوي|21.03|105.85|VNM|1
Ho Chi Minh City|مدينة هو تشي منه|10.82|106.63|VNM|2
Da Nang|دا نانغ|16.05|108.20|VNM|3
Bangkok|بانكوك|13.76|100.50|THA|1
Phnom Penh|بنوم بنه|11.56|104.92|KHM|1
Vientiane|فيينتيان|17.98|102.63|LAO|1
Naypyidaw|نايبيداو|19.76|96.08|MMR|1
Yangon|يانغون|16.84|96.17|MMR|2
Kuala Lumpur|كوالالمبور|3.14|101.69|MYS|1
Singapore|سنغافورة|1.35|103.82|SGP|1
Jakarta|جاكرتا|-6.21|106.85|IDN|1
Surabaya|سورابايا|-7.25|112.75|IDN|2
Medan|ميدان|3.60|98.67|IDN|3
Bandar Seri Begawan|بندر سري بكاوان|4.90|114.94|BRN|1
Manila|مانيلا|14.60|120.98|PHL|1
Cebu|سيبو|10.32|123.89|PHL|3
Davao|دافاو|7.19|125.46|PHL|3
Dili|ديلي|-8.56|125.57|TLS|1
Canberra|كانبرا|-35.28|149.13|AUS|1
Sydney|سيدني|-33.87|151.21|AUS|1
Melbourne|ملبورن|-37.81|144.96|AUS|2
Perth|بيرث|-31.95|115.86|AUS|2
Brisbane|بريزبن|-27.47|153.03|AUS|2
Darwin|داروين|-12.46|130.84|AUS|3
Wellington|ولنغتون|-41.29|174.78|NZL|1
Auckland|أوكلاند|-36.85|174.76|NZL|2
Port Moresby|بورت مورسبي|-9.44|147.18|PNG|1
Washington|واشنطن|38.90|-77.04|USA|1
New York|نيويورك|40.71|-74.01|USA|1
Los Angeles|لوس أنجلوس|34.05|-118.24|USA|1
Chicago|شيكاغو|41.88|-87.63|USA|2
Houston|هيوستن|29.76|-95.37|USA|2
Miami|ميامي|25.76|-80.19|USA|2
San Francisco|سان فرانسيسكو|37.77|-122.42|USA|2
Seattle|سياتل|47.61|-122.33|USA|2
San Diego|سان دييغو|32.72|-117.16|USA|2
Norfolk|نورفولك|36.85|-76.29|USA|3
Atlanta|أتلانتا|33.75|-84.39|USA|3
Dallas|دالاس|32.78|-96.80|USA|3
Denver|دنفر|39.74|-104.99|USA|3
Boston|بوسطن|42.36|-71.06|USA|3
Anchorage|أنكوريج|61.22|-149.90|USA|3
Honolulu|هونولولو|21.31|-157.86|USA|2
Guam|غوام|13.44|144.79|USA|3
Ottawa|أوتاوا|45.42|-75.70|CAN|1
Toronto|تورونتو|43.65|-79.38|CAN|1
Montreal|مونتريال|45.50|-73.57|CAN|2
Vancouver|فانكوفر|49.28|-123.12|CAN|2
Calgary|كالغاري|51.05|-114.07|CAN|3
Halifax|هاليفاكس|44.65|-63.58|CAN|3
Mexico City|مكسيكو سيتي|19.43|-99.13|MEX|1
Guadalajara|غوادالاخارا|20.67|-103.35|MEX|2
Monterrey|مونتيري|25.69|-100.32|MEX|2
Tijuana|تيخوانا|32.51|-117.04|MEX|3
Havana|هافانا|23.11|-82.37|CUB|1
Guantanamo|غوانتانامو|19.90|-75.10|CUB|3
Port-au-Prince|بورت أو برنس|18.59|-72.31|HTI|1
Santo Domingo|سانتو دومينغو|18.49|-69.93|DOM|1
Kingston|كينغستون|17.97|-76.79|JAM|1
Guatemala City|مدينة غواتيمالا|14.63|-90.51|GTM|1
San Salvador|سان سلفادور|13.69|-89.22|SLV|1
Tegucigalpa|تيغوسيغالبا|14.07|-87.19|HND|1
Managua|ماناغوا|12.11|-86.24|NIC|1
San Jose|سان خوسيه|9.93|-84.08|CRI|1
Panama City|مدينة بنما|8.98|-79.52|PAN|1
Caracas|كاراكاس|10.48|-66.90|VEN|1
Maracaibo|ماراكايبو|10.65|-71.64|VEN|3
Bogota|بوغوتا|4.71|-74.07|COL|1
Medellin|ميديلين|6.24|-75.58|COL|2
Quito|كيتو|-0.18|-78.47|ECU|1
Guayaquil|غواياكيل|-2.17|-79.92|ECU|3
Lima|ليما|-12.05|-77.04|PER|1
La Paz|لاباز|-16.50|-68.15|BOL|1
Santiago|سانتياغو|-33.45|-70.67|CHL|1
Buenos Aires|بوينس آيرس|-34.60|-58.38|ARG|1
Cordoba|قرطبة|-31.42|-64.18|ARG|3
Ushuaia|أوشوايا|-54.80|-68.30|ARG|3
Montevideo|مونتيفيديو|-34.90|-56.16|URY|1
Asuncion|أسونسيون|-25.26|-57.58|PRY|1
Brasilia|برازيليا|-15.79|-47.88|BRA|1
Sao Paulo|ساو باولو|-23.55|-46.63|BRA|1
Rio de Janeiro|ريو دي جانيرو|-22.91|-43.17|BRA|1
Salvador|سلفادور|-12.97|-38.50|BRA|3
Manaus|ماناوس|-3.12|-60.02|BRA|3
Recife|ريسيفي|-8.05|-34.88|BRA|3
Georgetown|جورجتاون|6.80|-58.16|GUY|1
Paramaribo|باراماريبو|5.85|-55.20|SUR|1
Stanley|ستانلي|-51.69|-57.86|GBR|3
Addis Ababa|أديس أبابا|8.98|38.76|ETH|1
Asmara|أسمرة|15.32|38.93|ERI|1
Djibouti|جيبوتي|11.59|43.15|DJI|1
Mogadishu|مقديشو|2.05|45.32|SOM|1
Hargeisa|هرجيسا|9.56|44.06|SOM|3
Nairobi|نيروبي|-1.29|36.82|KEN|1
Mombasa|مومباسا|-4.04|39.67|KEN|3
Kampala|كمبالا|0.35|32.58|UGA|1
Kigali|كيغالي|-1.95|30.06|RWA|1
Gitega|جيتيغا|-3.43|29.93|BDI|1
Juba|جوبا|4.85|31.58|SSD|1
Dodoma|دودوما|-6.16|35.75|TZA|1
Dar es Salaam|دار السلام|-6.79|39.21|TZA|2
Kinshasa|كينشاسا|-4.44|15.27|COD|1
Lubumbashi|لوبومباشي|-11.66|27.48|COD|2
Goma|غوما|-1.68|29.22|COD|3
Kisangani|كيسانغاني|0.52|25.19|COD|3
Brazzaville|برازافيل|-4.27|15.28|COG|1
Luanda|لواندا|-8.84|13.23|AGO|1
Lusaka|لوساكا|-15.39|28.32|ZMB|1
Harare|هراري|-17.83|31.05|ZWE|1
Lilongwe|ليلونغوي|-13.96|33.79|MWI|1
Maputo|مابوتو|-25.97|32.57|MOZ|1
Antananarivo|أنتاناناريفو|-18.88|47.51|MDG|1
Gaborone|غابورون|-24.63|25.92|BWA|1
Windhoek|ويندهوك|-22.56|17.08|NAM|1
Pretoria|بريتوريا|-25.75|28.19|ZAF|1
Johannesburg|جوهانسبرغ|-26.20|28.05|ZAF|1
Cape Town|كيب تاون|-33.92|18.42|ZAF|2
Durban|ديربان|-29.86|31.02|ZAF|3
Abuja|أبوجا|9.08|7.40|NGA|1
Lagos|لاغوس|6.52|3.38|NGA|1
Kano|كانو|12.00|8.52|NGA|3
Accra|أكرا|5.60|-0.19|GHA|1
Abidjan|أبيدجان|5.36|-4.01|CIV|1
Dakar|داكار|14.72|-17.47|SEN|1
Bamako|باماكو|12.64|-8.00|MLI|1
Timbuktu|تمبكتو|16.77|-3.01|MLI|3
Niamey|نيامي|13.51|2.11|NER|1
Ouagadougou|واغادوغو|12.37|-1.52|BFA|1
N'Djamena|إنجامينا|12.13|15.06|TCD|1
Yaounde|ياوندي|3.85|11.50|CMR|1
Bangui|بانغي|4.39|18.56|CAF|1
Libreville|ليبرفيل|0.42|9.47|GAB|1
Malabo|مالابو|3.75|8.78|GNQ|1
Conakry|كوناكري|9.64|-13.58|GIN|1
Freetown|فريتاون|8.47|-13.23|SLE|1
Monrovia|مونروفيا|6.31|-10.80|LBR|1
Lome|لومي|6.13|1.22|TGO|1
Porto-Novo|بورتو نوفو|6.50|2.60|BEN|1
Banjul|بانجول|13.45|-16.58|GMB|1
Bissau|بيساو|11.86|-15.60|GNB|1
Nuuk|نوك|64.18|-51.72|DNK|3
Taif|الطائف|21.27|40.42|SAU|4
Buraidah|بريدة|26.33|43.97|SAU|4
Hail|حائل|27.52|41.69|SAU|4
Jizan|جازان|16.89|42.55|SAU|4
Najran|نجران|17.49|44.13|SAU|4
Al Khobar|الخبر|26.28|50.21|SAU|4
Hofuf|الهفوف|25.38|49.59|SAU|4
Yanbu|ينبع|24.09|38.06|SAU|4
Khamis Mushait|خميس مشيط|18.31|42.73|SAU|4
Arar|عرعر|30.98|41.04|SAU|4
Sakaka|سكاكا|29.97|40.21|SAU|4
Al Ula|العلا|26.61|37.92|SAU|4
Hafar al-Batin|حفر الباطن|28.43|45.96|SAU|4
Al Ain|العين|24.21|55.74|ARE|4
Ras al-Khaimah|رأس الخيمة|25.79|55.94|ARE|4
Fujairah|الفجيرة|25.12|56.33|ARE|4
Sohar|صحار|24.35|56.71|OMN|4
Nizwa|نزوى|22.93|57.53|OMN|4
Duqm|الدقم|19.66|57.70|OMN|4
Khasab|خصب|26.18|56.25|OMN|4
Al Wakrah|الوكرة|25.17|51.60|QAT|4
Ahmadi|الأحمدي|29.08|48.08|KWT|4
Taiz|تعز|13.58|44.02|YEM|4
Marib|مأرب|15.46|45.32|YEM|4
Mukalla|المكلا|14.54|49.12|YEM|4
Saada|صعدة|16.94|43.76|YEM|4
Qom|قم|34.64|50.88|IRN|4
Kermanshah|كرمانشاه|34.31|47.07|IRN|4
Kerman|كرمان|30.28|57.08|IRN|4
Yazd|يزد|31.90|54.37|IRN|4
Rasht|رشت|37.28|49.58|IRN|4
Zahedan|زاهدان|29.50|60.86|IRN|4
Chabahar|تشابهار|25.29|60.64|IRN|4
Hamadan|همدان|34.80|48.51|IRN|4
Natanz|نطنز|33.51|51.92|IRN|4
Arak|أراك|34.09|49.69|IRN|4
Urmia|أرومية|37.55|45.08|IRN|4
Kirkuk|كركوك|35.47|44.39|IRQ|4
Najaf|النجف|32.00|44.34|IRQ|4
Karbala|كربلاء|32.62|44.02|IRQ|4
Sulaymaniyah|السليمانية|35.56|45.44|IRQ|4
Fallujah|الفلوجة|33.35|43.78|IRQ|4
Ramadi|الرمادي|33.42|43.30|IRQ|4
Tikrit|تكريت|34.61|43.68|IRQ|4
Deir ez-Zor|دير الزور|35.34|40.14|SYR|4
Raqqa|الرقة|35.95|39.01|SYR|4
Idlib|إدلب|35.93|36.63|SYR|4
Hama|حماة|35.13|36.75|SYR|4
Tartus|طرطوس|34.89|35.89|SYR|4
Daraa|درعا|32.62|36.10|SYR|4
Qamishli|القامشلي|37.05|41.22|SYR|4
Irbid|إربد|32.56|35.85|JOR|4
Zarqa|الزرقاء|32.07|36.09|JOR|4
Tripoli (Lebanon)|طرابلس|34.44|35.83|LBN|4
Sidon|صيدا|33.56|35.37|LBN|4
Tyre|صور|33.27|35.20|LBN|4
Baalbek|بعلبك|34.01|36.21|LBN|4
Beersheba|بئر السبع|31.25|34.79|ISR|4
Ashdod|أسدود|31.80|34.65|ISR|4
Nazareth|الناصرة|32.70|35.30|ISR|4
Khan Yunis|خان يونس|31.35|34.31|PSE|4
Nablus|نابلس|32.22|35.26|PSE|4
Hebron|الخليل|31.53|35.10|PSE|4
Luxor|الأقصر|25.69|32.64|EGY|4
Ismailia|الإسماعيلية|30.60|32.27|EGY|4
Hurghada|الغردقة|27.26|33.81|EGY|4
Sharm el-Sheikh|شرم الشيخ|27.92|34.33|EGY|4
Mansoura|المنصورة|31.04|31.38|EGY|4
Asyut|أسيوط|27.18|31.18|EGY|4
El Arish|العريش|31.13|33.80|EGY|4
Marsa Matruh|مرسى مطروح|31.35|27.24|EGY|4
Omdurman|أم درمان|15.64|32.48|SDN|4
El Fasher|الفاشر|13.63|25.35|SDN|4
Nyala|نيالا|12.05|24.88|SDN|4
Kassala|كسلا|15.45|36.40|SDN|4
Misrata|مصراتة|32.38|15.09|LBY|4
Sirte|سرت|31.21|16.59|LBY|4
Tobruk|طبرق|32.08|23.96|LBY|4
Sabha|سبها|27.04|14.43|LBY|4
Sfax|صفاقس|34.74|10.76|TUN|4
Sousse|سوسة|35.83|10.64|TUN|4
Constantine|قسنطينة|36.37|6.61|DZA|4
Annaba|عنابة|36.90|7.77|DZA|4
Tamanrasset|تمنراست|22.79|5.52|DZA|4
Marrakesh|مراكش|31.63|-8.01|MAR|4
Fez|فاس|34.03|-5.00|MAR|4
Agadir|أكادير|30.43|-9.60|MAR|4
Laayoune|العيون|27.15|-13.20|MAR|4
Bursa|بورصة|40.19|29.06|TUR|4
Adana|أضنة|37.00|35.32|TUR|4
Gaziantep|غازي عنتاب|37.07|37.38|TUR|4
Konya|قونية|37.87|32.48|TUR|4
Diyarbakir|ديار بكر|37.91|40.24|TUR|4
Trabzon|طرابزون|41.00|39.72|TUR|4
Erzurum|أرضروم|39.90|41.27|TUR|4
Van|وان|38.50|43.38|TUR|4
Samsun|سامسون|41.29|36.33|TUR|4
Patras|باتراس|38.25|21.73|GRC|4
Heraklion|هيراكليون|35.34|25.13|GRC|4
Souda Bay|خليج سودا|35.49|24.12|GRC|4
Limassol|ليماسول|34.68|33.04|CYP|4
Birmingham|برمنغهام|52.49|-1.89|GBR|4
Glasgow|غلاسكو|55.86|-4.25|GBR|4
Liverpool|ليفربول|53.41|-2.98|GBR|4
Leeds|ليدز|53.80|-1.55|GBR|4
Bristol|بريستول|51.45|-2.59|GBR|4
Cardiff|كارديف|51.48|-3.18|GBR|4
Plymouth|بليموث|50.38|-4.14|GBR|4
Faslane|فاسلين|56.07|-4.82|GBR|4
Lakenheath|لاكنهيث|52.41|0.56|GBR|4
Cork|كورك|51.90|-8.47|IRL|4
Bordeaux|بوردو|44.84|-0.58|FRA|4
Toulouse|تولوز|43.60|1.44|FRA|4
Nice|نيس|43.70|7.27|FRA|4
Lille|ليل|50.63|3.06|FRA|4
Strasbourg|ستراسبورغ|48.57|7.75|FRA|4
Nantes|نانت|47.22|-1.55|FRA|4
Cherbourg|شيربورغ|49.64|-1.62|FRA|4
Ajaccio|أجاكسيو|41.93|8.74|FRA|4
Cologne|كولونيا|50.94|6.96|DEU|4
Stuttgart|شتوتغارت|48.78|9.18|DEU|4
Dresden|دريسدن|51.05|13.74|DEU|4
Leipzig|لايبزيغ|51.34|12.37|DEU|4
Hanover|هانوفر|52.37|9.73|DEU|4
Kiel|كيل|54.32|10.12|DEU|4
Nuremberg|نورنبيرغ|49.45|11.08|DEU|4
Bremen|بريمن|53.08|8.80|DEU|4
Dusseldorf|دوسلدورف|51.23|6.78|DEU|4
Antwerp|أنتويرب|51.22|4.40|BEL|4
Utrecht|أوترخت|52.09|5.12|NLD|4
Basel|بازل|47.56|7.59|CHE|4
Graz|غراتس|47.07|15.44|AUT|4
Salzburg|سالزبورغ|47.81|13.06|AUT|4
Turin|تورينو|45.07|7.69|ITA|4
Venice|البندقية|45.44|12.32|ITA|4
Florence|فلورنسا|43.77|11.26|ITA|4
Bologna|بولونيا|44.49|11.34|ITA|4
Genoa|جنوة|44.41|8.93|ITA|4
Bari|باري|41.12|16.87|ITA|4
Palermo|باليرمو|38.12|13.36|ITA|4
Taranto|تارانتو|40.47|17.24|ITA|4
Aviano|أفيانو|46.07|12.59|ITA|4
Cagliari|كالياري|39.22|9.12|ITA|4
Valencia|بلنسية|39.47|-0.38|ESP|4
Bilbao|بلباو|43.26|-2.93|ESP|4
Malaga|مالقة|36.72|-4.42|ESP|4
Zaragoza|سرقسطة|41.65|-0.88|ESP|4
Palma|بالما|39.57|2.65|ESP|4
Cartagena (Spain)|قرطاجنة|37.61|-0.99|ESP|4
Faro|فارو|37.02|-7.93|PRT|4
Aarhus|آرهوس|56.16|10.20|DNK|4
Trondheim|تروندهايم|63.43|10.40|NOR|4
Tromso|ترومسو|69.65|18.96|NOR|4
Bodo|بودو|67.28|14.40|NOR|4
Malmo|مالمو|55.60|13.00|SWE|4
Lulea|لوليو|65.58|22.15|SWE|4
Visby|فيسبي|57.64|18.30|SWE|4
Tampere|تامبيري|61.50|23.76|FIN|4
Turku|توركو|60.45|22.27|FIN|4
Oulu|أولو|65.01|25.47|FIN|4
Tartu|تارتو|58.38|26.72|EST|4
Narva|نارفا|59.38|28.19|EST|4
Daugavpils|داوغافبيلس|55.87|26.54|LVA|4
Kaunas|كاوناس|54.90|23.90|LTU|4
Klaipeda|كلايبيدا|55.70|21.14|LTU|4
Poznan|بوزنان|52.41|16.93|POL|4
Wroclaw|فروتسواف|51.11|17.04|POL|4
Lodz|لودز|51.76|19.46|POL|4
Lublin|لوبلين|51.25|22.57|POL|4
Bialystok|بياليستوك|53.13|23.16|POL|4
Szczecin|شتشين|53.43|14.55|POL|4
Brno|برنو|49.20|16.61|CZE|4
Ostrava|أوسترافا|49.82|18.26|CZE|4
Kosice|كوشيتسه|48.72|21.26|SVK|4
Debrecen|دبرتسن|47.53|21.64|HUN|4
Cluj-Napoca|كلوج نابوكا|46.77|23.59|ROU|4
Iasi|ياش|47.16|27.59|ROU|4
Timisoara|تيميشوارا|45.75|21.23|ROU|4
Galati|غالاتي|45.44|28.05|ROU|4
Plovdiv|بلوفديف|42.15|24.75|BGR|4
Burgas|بورغاس|42.50|27.47|BGR|4
Novi Sad|نوفي ساد|45.27|19.83|SRB|4
Nis|نيش|43.32|21.90|SRB|4
Split|سبليت|43.51|16.44|HRV|4
Banja Luka|بانيا لوكا|44.77|17.19|BIH|4
Mostar|موستار|43.34|17.81|BIH|4
Durres|دوريس|41.32|19.45|ALB|4
Tiraspol|تيراسبول|46.84|29.63|MDA|4
Balti|بالتي|47.76|27.93|MDA|4
Gomel|غوميل|52.44|30.98|BLR|4
Grodno|غرودنو|53.68|23.83|BLR|4
Vitebsk|فيتيبسك|55.19|30.20|BLR|4
Mogilev|موغيليف|53.90|30.33|BLR|4
Chernihiv|تشيرنيهيف|51.49|31.29|UKR|4
Sumy|سومي|50.91|34.80|UKR|4
Poltava|بولتافا|49.59|34.55|UKR|4
Mykolaiv|ميكولايف|46.97|31.99|UKR|4
Vinnytsia|فينيتسا|49.23|28.47|UKR|4
Zhytomyr|جيتومير|50.25|28.66|UKR|4
Kryvyi Rih|كريفي ريه|47.91|33.39|UKR|4
Luhansk|لوهانسك|48.57|39.31|UKR|4
Bakhmut|باخموت|48.59|38.00|UKR|4
Kramatorsk|كراماتورسك|48.72|37.56|UKR|4
Melitopol|ميليتوبول|46.85|35.37|UKR|4
Simferopol|سيمفيروبول|44.95|34.10|UKR|4
Kerch|كيرتش|45.36|36.47|UKR|4
Uzhhorod|أوجهورود|48.62|22.29|UKR|4
Chernivtsi|تشيرنيفتسي|48.29|25.94|UKR|4
Ternopil|ترنوبل|49.55|25.59|UKR|4
Rivne|ريفني|50.62|26.25|UKR|4
Kursk|كورسك|51.73|36.19|RUS|4
Belgorod|بيلغورود|50.60|36.59|RUS|4
Voronezh|فورونيج|51.67|39.18|RUS|4
Bryansk|بريانسك|53.24|34.36|RUS|4
Smolensk|سمولينسك|54.78|32.05|RUS|4
Pskov|بسكوف|57.82|28.33|RUS|4
Nizhny Novgorod|نيجني نوفغورود|56.33|44.00|RUS|4
Samara|سامارا|53.20|50.15|RUS|4
Saratov|ساراتوف|51.53|46.03|RUS|4
Ufa|أوفا|54.74|55.97|RUS|4
Perm|بيرم|58.01|56.25|RUS|4
Chelyabinsk|تشيليابينسك|55.16|61.40|RUS|4
Krasnodar|كراسنودار|45.04|38.98|RUS|4
Astrakhan|أستراخان|46.35|48.04|RUS|4
Grozny|غروزني|43.32|45.69|RUS|4
Makhachkala|محج قلعة|42.98|47.50|RUS|4
Arkhangelsk|أرخانغيلسك|64.54|40.54|RUS|4
Severomorsk|سيفيرومورسك|69.07|33.42|RUS|4
Engels|إنغلز|51.48|46.12|RUS|4
Tula|تولا|54.19|37.62|RUS|4
Tver|تفير|56.86|35.90|RUS|4
Yaroslavl|ياروسلافل|57.63|39.87|RUS|4
Tyumen|تيومين|57.15|65.53|RUS|4
Barnaul|بارناول|53.35|83.78|RUS|4
Tomsk|تومسك|56.48|84.95|RUS|4
Chita|تشيتا|52.03|113.50|RUS|4
Ulan-Ude|أولان أودي|51.83|107.61|RUS|4
Blagoveshchensk|بلاغوفيشتشينسك|50.26|127.53|RUS|4
Magadan|ماغادان|59.56|150.80|RUS|4
Yuzhno-Sakhalinsk|يوجنو ساخالينسك|46.96|142.73|RUS|4
Anadyr|أنادير|64.73|177.51|RUS|4
Vorkuta|فوركوتا|67.50|64.03|RUS|4
Batumi|باتومي|41.64|41.64|GEO|4
Kutaisi|كوتايسي|42.27|42.70|GEO|4
Sukhumi|سوخومي|43.00|41.02|GEO|4
Gyumri|غيومري|40.79|43.85|ARM|4
Ganja|كنجة|40.68|46.36|AZE|4
Stepanakert|ستيباناكيرت|39.82|46.75|AZE|4
Nakhchivan|نخجوان|39.21|45.41|AZE|4
Karaganda|كاراغاندا|49.80|73.10|KAZ|4
Shymkent|شيمكنت|42.32|69.60|KAZ|4
Aktau|أكتاو|43.65|51.16|KAZ|4
Baikonur|بايكونور|45.62|63.31|KAZ|4
Bukhara|بخارى|39.77|64.42|UZB|4
Termez|ترمذ|37.22|67.28|UZB|4
Osh|أوش|40.53|72.80|KGZ|4
Khujand|خوجند|40.28|69.62|TJK|4
Turkmenbashi|تركمانباشي|40.02|52.97|TKM|4
Herat|هرات|34.35|62.20|AFG|4
Mazar-i-Sharif|مزار شريف|36.71|67.11|AFG|4
Jalalabad|جلال آباد|34.43|70.45|AFG|4
Kunduz|قندوز|36.73|68.86|AFG|4
Bagram|باغرام|34.95|69.26|AFG|4
Lashkar Gah|لشكر كاه|31.59|64.37|AFG|4
Rawalpindi|راولبندي|33.60|73.05|PAK|4
Faisalabad|فيصل آباد|31.42|73.08|PAK|4
Multan|ملتان|30.20|71.47|PAK|4
Hyderabad (Sindh)|حيدر آباد|25.40|68.37|PAK|4
Muzaffarabad|مظفر آباد|34.37|73.47|PAK|4
Gilgit|جلجت|35.92|74.31|PAK|4
Jaipur|جايبور|26.91|75.79|IND|4
Lucknow|لكناو|26.85|80.95|IND|4
Pune|بونه|18.52|73.86|IND|4
Amritsar|أمريتسار|31.63|74.87|IND|4
Jammu|جامو|32.73|74.86|IND|4
Leh|ليه|34.15|77.58|IND|4
Guwahati|غواهاتي|26.14|91.74|IND|4
Patna|باتنا|25.59|85.14|IND|4
Bhopal|بوبال|23.26|77.41|IND|4
Nagpur|ناغبور|21.15|79.09|IND|4
Kochi|كوتشي|9.93|76.27|IND|4
Goa|غوا|15.49|73.83|IND|4
Port Blair|بورت بلير|11.62|92.73|IND|4
Pokhara|بوخارا|28.21|83.99|NPL|4
Sylhet|سيلهيت|24.90|91.87|BGD|4
Jaffna|جافنا|9.66|80.01|LKA|4
Trincomalee|ترينكومالي|8.59|81.21|LKA|4
Hangzhou|هانغتشو|30.27|120.16|CHN|4
Suzhou|سوتشو|31.30|120.62|CHN|4
Zhengzhou|تشنغتشو|34.75|113.63|CHN|4
Changsha|تشانغشا|28.23|112.94|CHN|4
Shenyang|شنيانغ|41.81|123.43|CHN|4
Jinan|جينان|36.65|117.12|CHN|4
Hefei|خفي|31.82|117.23|CHN|4
Nanning|نانينغ|22.82|108.32|CHN|4
Lanzhou|لانتشو|36.06|103.83|CHN|4
Hohhot|هوهوت|40.84|111.75|CHN|4
Kashgar|كاشغر|39.47|75.99|CHN|4
Ningbo|نينغبو|29.87|121.54|CHN|4
Zhanjiang|تشانجيانغ|21.27|110.36|CHN|4
Haikou|هايكو|20.04|110.20|CHN|4
Wenzhou|ونتشو|28.00|120.67|CHN|4
Changchun|تشانغتشون|43.82|125.32|CHN|4
Taiyuan|تاييوان|37.87|112.55|CHN|4
Guiyang|غوييانغ|26.65|106.63|CHN|4
Xining|شينينغ|36.62|101.78|CHN|4
Yinchuan|ينتشوان|38.49|106.23|CHN|4
Dandong|داندونغ|40.12|124.38|CHN|4
Macau|ماكاو|22.20|113.55|CHN|4
Hualien|هوالين|23.99|121.60|TWN|4
Tainan|تاينان|22.99|120.21|TWN|4
Keelung|كيلونغ|25.13|121.74|TWN|4
Kinmen|كينمن|24.44|118.32|TWN|4
Daegu|دايغو|35.87|128.60|KOR|4
Gwangju|غوانغجو|35.16|126.85|KOR|4
Daejeon|دايجون|36.35|127.38|KOR|4
Pyeongtaek|بيونغتايك|36.99|127.11|KOR|4
Jeju|جيجو|33.50|126.53|KOR|4
Paju|باجو|37.76|126.78|KOR|4
Kaesong|كايسونغ|37.97|126.55|PRK|4
Hamhung|هامهونغ|39.92|127.54|PRK|4
Chongjin|تشونغجين|41.80|129.78|PRK|4
Sinuiju|سينويجو|40.10|124.40|PRK|4
Yongbyon|يونغبيون|39.80|125.76|PRK|4
Nampo|نامبو|38.74|125.41|PRK|4
Hiroshima|هيروشيما|34.39|132.46|JPN|4
Kyoto|كيوتو|35.01|135.77|JPN|4
Sendai|سنداي|38.27|140.87|JPN|4
Kobe|كوبي|34.69|135.20|JPN|4
Nagasaki|ناغازاكي|32.75|129.88|JPN|4
Sasebo|ساسيبو|33.18|129.72|JPN|4
Misawa|ميساوا|40.68|141.37|JPN|4
Kagoshima|كاغوشيما|31.60|130.56|JPN|4
Niigata|نييغاتا|37.92|139.04|JPN|4
Ishigaki|إيشيغاكي|24.34|124.16|JPN|4
Erdenet|إردينيت|49.03|104.08|MNG|4
Haiphong|هايفونغ|20.86|106.68|VNM|4
Hue|هوي|16.46|107.59|VNM|4
Cam Ranh|كام رانه|11.92|109.16|VNM|4
Can Tho|كان ثو|10.04|105.79|VNM|4
Chiang Mai|شيانغ ماي|18.79|98.98|THA|4
Phuket|بوكيت|7.88|98.39|THA|4
Pattaya|باتايا|12.93|100.88|THA|4
Siem Reap|سيم ريب|13.36|103.86|KHM|4
Ream|ريام|10.51|103.62|KHM|4
Mandalay|ماندالاي|21.97|96.08|MMR|4
Sittwe|سيتوي|20.15|92.90|MMR|4
Penang|بينانغ|5.41|100.33|MYS|4
Kota Kinabalu|كوتا كينابالو|5.98|116.07|MYS|4
Kuching|كوتشينغ|1.55|110.36|MYS|4
Johor Bahru|جوهور بارو|1.49|103.74|MYS|4
Bandung|باندونغ|-6.91|107.61|IDN|4
Makassar|ماكاسار|-5.15|119.43|IDN|4
Denpasar|دينباسار|-8.65|115.22|IDN|4
Jayapura|جايابورا|-2.53|140.72|IDN|4
Balikpapan|باليكبابان|-1.24|116.85|IDN|4
Palembang|باليمبانغ|-2.99|104.76|IDN|4
Banda Aceh|باندا آتشيه|5.55|95.32|IDN|4
Nusantara|نوسانتارا|-0.97|116.70|IDN|4
Subic Bay|خليج سوبيك|14.82|120.27|PHL|4
Zamboanga|زامبوانغا|6.91|122.08|PHL|4
Puerto Princesa|بويرتو برنسيسا|9.74|118.74|PHL|4
Laoag|لاواغ|18.20|120.59|PHL|4
Adelaide|أديلايد|-34.93|138.60|AUS|4
Hobart|هوبارت|-42.88|147.33|AUS|4
Townsville|تاونزفيل|-19.26|146.82|AUS|4
Cairns|كيرنز|-16.92|145.77|AUS|4
Alice Springs|أليس سبرينغز|-23.70|133.88|AUS|4
Tindal|تيندال|-14.52|132.38|AUS|4
Christchurch|كرايستشيرش|-43.53|172.64|NZL|4
Suva|سوفا|-18.14|178.44|FJI|4
Noumea|نوميا|-22.27|166.46|FRA|4
Honiara|هونيارا|-9.43|159.95|SLB|4
Philadelphia|فيلادلفيا|39.95|-75.17|USA|4
Phoenix|فينيكس|33.45|-112.07|USA|4
Detroit|ديترويت|42.33|-83.05|USA|4
Minneapolis|مينيابوليس|44.98|-93.27|USA|4
St Louis|سانت لويس|38.63|-90.20|USA|4
New Orleans|نيو أورلينز|29.95|-90.07|USA|4
Las Vegas|لاس فيغاس|36.17|-115.14|USA|4
Portland|بورتلاند|45.52|-122.68|USA|4
Salt Lake City|سولت ليك سيتي|40.76|-111.89|USA|4
Kansas City|كانساس سيتي|39.10|-94.58|USA|4
Nashville|ناشفيل|36.16|-86.78|USA|4
Charlotte|شارلوت|35.23|-80.84|USA|4
Pittsburgh|بيتسبرغ|40.44|-80.00|USA|4
Tampa|تامبا|27.95|-82.46|USA|4
Jacksonville|جاكسونفيل|30.33|-81.66|USA|4
San Antonio|سان أنطونيو|29.42|-98.49|USA|4
Austin|أوستن|30.27|-97.74|USA|4
Albuquerque|البوكيرك|35.08|-106.65|USA|4
Omaha|أوماها|41.26|-95.94|USA|4
Colorado Springs|كولورادو سبرينغز|38.83|-104.82|USA|4
Fort Bragg|فورت براغ|35.14|-79.00|USA|4
Whiteman AFB|قاعدة وايتمان|38.73|-93.55|USA|4
Barksdale AFB|قاعدة باركسديل|32.50|-93.66|USA|4
Cheyenne|شايان|41.14|-104.82|USA|4
Fairbanks|فيربانكس|64.84|-147.72|USA|4
El Paso|إل باسو|31.76|-106.49|USA|4
Sacramento|ساكرامنتو|38.58|-121.49|USA|4
Cleveland|كليفلاند|41.50|-81.69|USA|4
Winnipeg|وينيبيغ|49.90|-97.14|CAN|4
Edmonton|إدمونتون|53.55|-113.49|CAN|4
Quebec City|كيبيك|46.81|-71.21|CAN|4
St John's|سانت جونز|47.56|-52.71|CAN|4
Iqaluit|إيكالويت|63.75|-68.52|CAN|4
Yellowknife|يلونايف|62.45|-114.37|CAN|4
Whitehorse|وايتهورس|60.72|-135.06|CAN|4
Puebla|بويبلا|19.04|-98.21|MEX|4
Cancun|كانكون|21.16|-86.85|MEX|4
Merida|ميريدا|20.97|-89.62|MEX|4
Ciudad Juarez|سيوداد خواريز|31.69|-106.42|MEX|4
Veracruz|فيراكروز|19.17|-96.13|MEX|4
Acapulco|أكابولكو|16.85|-99.82|MEX|4
Culiacan|كولياكان|24.81|-107.39|MEX|4
Santiago de Cuba|سانتياغو دي كوبا|20.02|-75.82|CUB|4
San Juan|سان خوان|18.47|-66.11|USA|4
Nassau|ناسو|25.05|-77.35|BHS|4
Port of Spain|بورت أوف سبين|10.65|-61.51|TTO|4
Colon|كولون|9.36|-79.90|PAN|4
Valencia (Venezuela)|بلنسية|10.16|-68.00|VEN|4
Barquisimeto|باركيسيميتو|10.07|-69.32|VEN|4
Ciudad Guayana|سيوداد غويانا|8.35|-62.64|VEN|4
Cali|كالي|3.45|-76.53|COL|4
Barranquilla|بارانكيا|10.96|-74.80|COL|4
Cartagena|قرطاجنة|10.39|-75.48|COL|4
Cucuta|كوكوتا|7.89|-72.51|COL|4
Cusco|كوسكو|-13.53|-71.97|PER|4
Arequipa|أريكيبا|-16.41|-71.54|PER|4
Iquitos|إكيتوس|-3.75|-73.25|PER|4
Santa Cruz|سانتا كروز|-17.78|-63.18|BOL|4
Antofagasta|أنتوفاغاستا|-23.65|-70.40|CHL|4
Valparaiso|فالباريسو|-33.05|-71.62|CHL|4
Punta Arenas|بونتا أريناس|-53.16|-70.91|CHL|4
Rosario|روساريو|-32.95|-60.64|ARG|4
Mendoza|مندوزا|-32.89|-68.83|ARG|4
Mar del Plata|مار دل بلاتا|-38.00|-57.56|ARG|4
Comodoro Rivadavia|كومودورو ريفادافيا|-45.86|-67.48|ARG|4
Belo Horizonte|بيلو هوريزونتي|-19.92|-43.94|BRA|4
Porto Alegre|بورتو أليغري|-30.03|-51.23|BRA|4
Fortaleza|فورتاليزا|-3.73|-38.53|BRA|4
Curitiba|كوريتيبا|-25.43|-49.27|BRA|4
Belem|بيليم|-1.46|-48.49|BRA|4
Natal|ناتال|-5.79|-35.21|BRA|4
Cuiaba|كويابا|-15.60|-56.10|BRA|4
Boa Vista|بوا فيستا|2.82|-60.67|BRA|4
Cayenne|كايين|4.92|-52.31|FRA|4
Kourou|كورو|5.16|-52.65|FRA|4
Dire Dawa|دير داوا|9.59|41.87|ETH|4
Mekelle|مقلي|13.50|39.47|ETH|4
Gondar|غوندار|12.61|37.47|ETH|4
Bahir Dar|بحر دار|11.59|37.39|ETH|4
Massawa|مصوع|15.61|39.45|ERI|4
Assab|عصب|13.01|42.74|ERI|4
Berbera|بربرة|10.44|45.01|SOM|4
Kismayo|كيسمايو|-0.36|42.55|SOM|4
Bosaso|بوصاصو|11.28|49.18|SOM|4
Baidoa|بيدوا|3.11|43.65|SOM|4
Kisumu|كيسومو|-0.09|34.77|KEN|4
Garissa|غاريسا|-0.45|39.65|KEN|4
Gulu|غولو|2.77|32.30|UGA|4
Bukavu|بوكافو|-2.51|28.86|COD|4
Mbuji-Mayi|مبوجي مايي|-6.14|23.59|COD|4
Kananga|كانانغا|-5.90|22.42|COD|4
Zanzibar|زنجبار|-6.17|39.20|TZA|4
Arusha|أروشا|-3.39|36.68|TZA|4
Mwanza|موانزا|-2.52|32.90|TZA|4
Beira|بيرا|-19.83|34.84|MOZ|4
Pemba|بيمبا|-12.97|40.52|MOZ|4
Bulawayo|بولاوايو|-20.15|28.58|ZWE|4
Ndola|ندولا|-12.96|28.64|ZMB|4
Blantyre|بلانتاير|-15.79|35.01|MWI|4
Benguela|بنغيلا|-12.58|13.41|AGO|4
Cabinda|كابيندا|-5.55|12.20|AGO|4
Pointe-Noire|بوانت نوار|-4.78|11.86|COG|4
Douala|دوالا|4.05|9.70|CMR|4
Port Harcourt|بورت هاركورت|4.82|7.03|NGA|4
Ibadan|إبادان|7.38|3.95|NGA|4
Maiduguri|مايدوغوري|11.85|13.16|NGA|4
Kaduna|كادونا|10.52|7.44|NGA|4
Kumasi|كوماسي|6.69|-1.62|GHA|4
Tamale|تمالي|9.40|-0.84|GHA|4
Gao|غاو|16.27|-0.04|MLI|4
Kidal|كيدال|18.44|1.41|MLI|4
Agadez|أغاديز|16.97|7.99|NER|4
Bobo-Dioulasso|بوبو ديولاسو|11.18|-4.30|BFA|4
Saint-Louis|سان لويس|16.03|-16.49|SEN|4
Nouadhibou|نواذيبو|20.94|-17.04|MRT|4
Abeche|أبشي|13.83|20.83|TCD|4
Port Elizabeth|بورت إليزابيث|-33.96|25.60|ZAF|4
Bloemfontein|بلومفونتين|-29.12|26.21|ZAF|4
Simon's Town|سايمونز تاون|-34.19|18.43|ZAF|4
Walvis Bay|والفيس باي|-22.96|14.51|NAM|4
Francistown|فرانسيس تاون|-21.17|27.51|BWA|4
Toamasina|تواماسينا|-18.15|49.40|MDG|4
Port Louis|بورت لويس|-20.16|57.50|MUS|4
Diego Garcia|دييغو غارسيا|-7.31|72.41|GBR|4
Reunion|ريونيون|-20.88|55.45|FRA|4
Seychelles|سيشل|-4.62|55.45|SYC|4
Moroni|موروني|-11.70|43.26|COM|4
Las Palmas|لاس بالماس|28.12|-15.43|ESP|4
Ceuta|سبتة|35.89|-5.32|ESP|4
Gibraltar|جبل طارق|36.14|-5.35|GBR|4
Valletta|فاليتا|35.90|14.51|MLT|4
Azores|الأزور|37.74|-25.67|PRT|4
Svalbard|سفالبارد|78.22|15.65|NOR|4
Thule|ثول|76.53|-68.70|DNK|4
Akrotiri|أكروتيري|34.59|32.99|GBR|4
`;

export const CITIES = RAW.trim().split('\n').map(line => {
  const [name, ar, lat, lon, a3, tier] = line.split('|');
  return { name, ar, lat: +lat, lon: +lon, a3, tier: +tier };
});
