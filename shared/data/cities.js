// Major cities, shown on the map when the camera zooms in or a country is in focus.
// Columns: name | Arabic name | lat | lon | country (alpha-3) | tier (1 capital or megacity, 2 major city, 3 regional city)
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
`;

export const CITIES = RAW.trim().split('\n').map(line => {
  const [name, ar, lat, lon, a3, tier] = line.split('|');
  return { name, ar, lat: +lat, lon: +lon, a3, tier: +tier };
});
