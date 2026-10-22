// Real-world starting economies (approximate, 2025), so countries do not all begin at the same 100%.
//   inflation   consumer price inflation, % a year
//   support     public approval of the government, %
//   stability   political stability, 0-100 (roughly the World Bank stability percentile)
//   industry    health of the industrial base: 1 is normal, below 1 is held back by war, sanctions or decay, above 1 is booming
//   energy      energy security: grid reliability and fuel supply. Exporters sit above 1; blackout-hit countries far below
//   reserves    usable war chest in $bn: foreign reserves plus sovereign wealth that can be spent, or borrowing room for the US
//   growth      real GDP growth, % a year (applied gradually as turns pass)
// Countries not listed start with the defaults at the bottom.
//
// Columns: inflation | support | stability | industry | energy | reserves | growth
const RAW = `
USA 2.9 42 62 1.0 1.1 2000 1.9
CAN 2.0 44 88 1.0 1.1 120 1.2
MEX 3.8 70 25 0.95 0.95 240 0.5
BRA 5.2 45 35 0.95 1.05 340 2.2
ARG 35 45 40 0.8 0.95 30 4.5
CHL 4.3 30 55 0.95 0.95 45 2.4
COL 5.0 33 20 0.9 1.0 62 2.4
VEN 80 20 12 0.45 0.6 10 3.0
PER 1.8 5 30 0.95 0.95 80 3.0
CUB 30 30 50 0.5 0.4 1 -1.5
GBR 3.6 30 60 0.95 0.95 180 1.1
FRA 1.2 25 55 0.95 1.05 250 0.8
DEU 2.2 35 70 0.92 0.9 400 0.2
ITA 1.7 42 60 0.95 0.9 250 0.6
ESP 2.5 38 55 1.0 0.95 95 2.7
PRT 2.3 45 80 0.95 0.95 30 1.9
NLD 3.3 35 75 1.0 0.95 70 1.4
BEL 2.8 40 65 0.95 1.0 45 1.0
POL 3.5 48 65 1.05 0.95 230 3.3
UKR 13 60 8 0.55 0.55 40 2.0
BLR 6.5 60 35 0.75 1.0 8 2.5
RUS 9 70 22 0.9 1.1 300 1.0
SWE 1.0 40 80 1.0 1.05 60 1.5
NOR 3.0 40 90 1.0 1.2 1000 1.5
FIN 1.5 30 85 0.95 1.0 15 0.5
DNK 1.8 40 85 1.05 1.0 100 2.5
IRL 2.0 40 85 1.1 0.9 15 3.0
AUT 3.5 35 75 0.95 0.95 30 0.3
CHE 0.2 55 90 1.0 1.0 900 1.2
CZE 2.5 30 75 0.95 0.95 160 1.8
SVK 4.0 35 65 0.95 0.95 10 1.0
HUN 4.5 45 70 0.9 0.9 45 0.8
ROU 8.0 30 55 0.95 0.95 75 1.0
BGR 4.0 30 55 0.95 0.95 45 2.8
GRC 2.8 30 60 0.95 0.95 15 2.2
TUR 35 42 20 0.95 0.95 80 3.0
SRB 4.0 40 45 0.9 0.95 30 2.5
HRV 4.0 40 65 0.95 0.95 5 3.0
EST 5.0 25 70 0.95 1.0 3 0.5
LVA 3.5 25 70 0.95 0.95 5 1.0
LTU 3.5 30 75 1.0 0.95 6 2.5
MDA 7.0 35 40 0.8 0.8 5 1.5
SAU 2.0 75 50 1.05 1.15 700 3.5
ARE 2.0 80 70 1.1 1.15 1000 4.5
QAT 1.0 80 80 1.05 1.2 500 2.5
KWT 2.5 65 60 1.0 1.0 900 2.0
BHR 0.5 60 40 1.0 1.05 6 3.0
OMN 1.0 70 65 1.0 1.1 60 2.5
YEM 30 20 2 0.3 0.3 1 -1.5
IRN 40 25 12 0.75 0.75 30 0.5
IRQ 3.0 35 10 0.75 0.7 100 1.5
SYR 40 35 4 0.3 0.3 1 1.0
JOR 2.0 45 40 0.95 0.9 22 2.5
LBN 15 15 10 0.5 0.35 10 2.0
ISR 3.0 30 15 1.0 1.0 230 3.0
PSE 50 15 3 0.25 0.25 0 -10
EGY 14 40 25 0.85 0.8 45 4.0
LBY 2.5 20 8 0.6 0.7 80 10
DZA 4.0 45 30 0.9 1.1 70 3.5
MAR 1.0 45 40 0.95 0.9 37 3.5
TUN 5.5 40 30 0.85 0.85 9 1.5
SDN 80 15 2 0.35 0.35 0 -6
IND 2.5 65 25 1.0 0.9 650 6.5
PAK 4.5 35 10 0.8 0.7 12 2.7
AFG 0 30 5 0.4 0.4 2 2.0
CHN 0.2 80 40 1.1 1.0 3300 4.8
PRK 10 70 30 0.5 0.4 3 3.0
KOR 2.1 50 60 1.05 0.95 410 1.0
JPN 3.2 30 85 1.0 0.9 1250 0.8
TWN 1.8 40 60 1.15 0.85 580 4.5
MNG 8.0 45 65 0.9 0.8 5 5.5
KAZ 12 60 40 0.95 1.05 45 5.5
UZB 9.0 65 40 0.9 0.9 45 6.5
VNM 3.3 75 50 1.1 0.95 85 7.0
THA 0.0 30 35 0.95 0.95 240 2.0
IDN 2.0 75 30 1.0 1.0 155 5.0
MYS 1.5 50 55 1.0 1.05 120 4.5
PHL 1.7 45 20 1.0 0.85 105 5.5
MMR 25 20 5 0.6 0.5 5 -1.5
BGD 9.0 40 15 0.9 0.75 25 4.0
LKA 0.0 45 40 0.8 0.8 6 4.5
SGP 1.0 60 95 1.05 0.95 380 2.5
AUS 2.4 40 80 1.0 1.05 75 1.5
NZL 2.5 35 90 0.95 1.0 15 0.8
NGA 23 30 10 0.75 0.55 38 3.5
ETH 15 40 8 0.75 0.6 2 7.0
ZAF 3.3 40 35 0.85 0.75 65 1.0
KEN 4.0 30 25 0.9 0.75 9 4.8
AGO 20 35 30 0.8 0.85 15 2.5
COD 10 30 5 0.6 0.4 6 5.0
AZE 5.5 60 40 0.95 1.15 70 3.0
ARM 3.0 25 40 0.95 0.9 4 5.0
GEO 4.0 30 45 0.95 0.9 5 7.0
ISL 4.0 35 90 1.0 1.15 7 1.0
CYP 2.0 35 70 1.0 0.9 2 3.0
MLT 2.5 45 85 1.05 0.95 1 4.0
`;

export const ECONOMY_DEFAULT = { inflation: 5, support: 50, stability: 45, industry: 0.9, energy: 0.85, reserves: null, growth: 3 };

export const ECONOMIES = Object.fromEntries(RAW.trim().split('\n').map(line => {
  const [a3, inflation, support, stability, industry, energy, reserves, growth] = line.trim().split(/\s+/);
  return [a3, { inflation: +inflation, support: +support, stability: +stability, industry: +industry, energy: +energy, reserves: +reserves, growth: +growth }];
}));
