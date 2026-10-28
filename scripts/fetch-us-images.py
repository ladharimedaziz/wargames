#!/usr/bin/env python3
"""Downloads state flags and federal agency seals from Wikimedia Commons (public domain US works) and saves them in <scratch dir>/img and writes img-result.json
(id -> file). scripts/rasterize-us-images.mjs then shrinks them to 96 px PNGs in client/img/us/. Each id lists candidate file names; the first that exists is used, the rest are tried only if it does not.
Commons rate-limits, so requests are paced. Usage: python3 scripts/fetch-us-images.py <scratch dir>"""
import hashlib, json, os, subprocess, sys, time
scratch = sys.argv[1]
os.makedirs(os.path.join(scratch, 'img'), exist_ok=True)
STATES = {'AL':'Alabama','AZ':'Arizona','AR':'Arkansas','CA':'California','CO':'Colorado','CT':'Connecticut','DE':'Delaware','FL':'Florida','GA':'Georgia','ID':'Idaho','IL':'Illinois','IN':'Indiana','IA':'Iowa','KS':'Kansas','KY':'Kentucky','LA':'Louisiana','ME':'Maine','MD':'Maryland','MA':'Massachusetts','MI':'Michigan','MN':'Minnesota','MS':'Mississippi','MO':'Missouri','MT':'Montana','NE':'Nebraska','NV':'Nevada','NH':'New_Hampshire','NJ':'New_Jersey','NM':'New_Mexico','NY':'New_York','NC':'North_Carolina','ND':'North_Dakota','OH':'Ohio','OK':'Oklahoma','OR':'Oregon','PA':'Pennsylvania','RI':'Rhode_Island','SC':'South_Carolina','SD':'South_Dakota','TN':'Tennessee','TX':'Texas','UT':'Utah','VT':'Vermont','VA':'Virginia','WA':'Washington','WV':'West_Virginia','WI':'Wisconsin','WY':'Wyoming'}
WANT = {f'flag-{k}': [f'Flag_of_{v}.svg'] for k, v in STATES.items()}
WANT['flag-DC'] = ['Flag_of_the_District_of_Columbia.svg']
WANT.update({
 'fbi': ['Seal_of_the_Federal_Bureau_of_Investigation.svg'], 'dhs': ['Seal_of_the_United_States_Department_of_Homeland_Security.svg'],
 'usmc': ['Emblem_of_the_United_States_Marine_Corps.svg'], 'uscg': ['Seal_of_the_United_States_Coast_Guard.svg'],
 'army': ['Seal_of_the_United_States_Department_of_the_Army.svg', 'Emblem_of_the_United_States_Department_of_the_Army.svg'],
 'navy': ['Seal_of_the_United_States_Department_of_the_Navy.svg', 'Emblem_of_the_United_States_Department_of_the_Navy.svg'],
 'usaf': ['Seal_of_the_United_States_Department_of_the_Air_Force.svg', 'United_States_Department_of_the_Air_Force_seal.svg'],
 'ussf': ['Seal_of_the_United_States_Space_Force.svg', 'United_States_Space_Force_emblem.svg'],
 'ngb': ['Seal_of_the_National_Guard_Bureau.svg', 'National_Guard_Bureau_seal.svg', 'Seal_of_the_United_States_National_Guard_Bureau.svg'],
 'fema': ['Logo_of_the_United_States_Federal_Emergency_Management_Agency.svg', 'FEMA_logo.svg', 'Seal_of_the_Federal_Emergency_Management_Agency.svg'],
 'cdc': ['Logo_of_the_United_States_Centers_for_Disease_Control_and_Prevention.svg', 'CDC_logo.svg'],
 'ice': ['Seal_of_the_U.S._Immigration_and_Customs_Enforcement.svg', 'Seal_of_the_United_States_Immigration_and_Customs_Enforcement.svg'],
 'cbp': ['Seal_of_the_United_States_Customs_and_Border_Protection.svg', 'Seal_of_the_U.S._Customs_and_Border_Protection.svg'],
 'usbp': ['Seal_of_the_United_States_Border_Patrol.svg', 'Seal_of_the_U.S._Border_Patrol.svg'],
 'usss': ['Seal_of_the_United_States_Secret_Service.svg', 'Seal_of_the_U.S._Secret_Service.svg'],
 'dea': ['Seal_of_the_United_States_Drug_Enforcement_Administration.svg', 'Seal_of_the_U.S._Drug_Enforcement_Administration.svg'],
 'atf': ['Seal_of_the_United_States_Bureau_of_Alcohol,_Tobacco,_Firearms_and_Explosives.svg', 'Seal_of_the_Bureau_of_Alcohol,_Tobacco,_Firearms_and_Explosives.svg'],
 'usms': ['Seal_of_the_United_States_Marshals_Service.svg', 'Seal_of_the_U.S._Marshals_Service.svg'],
 'nsa': ['National_Security_Agency.svg', 'Seal_of_the_United_States_National_Security_Agency.svg'],
 'dod': ['Seal_of_the_United_States_Department_of_Defense.svg'],
 'usg': ['Seal_of_the_President_of_the_United_States.svg', 'Seal_of_the_United_States.svg'],
 'usss-x': [], 
})
WANT = {k: v for k, v in WANT.items() if v}
UA = 'WorldEngineMUN/1.0 (https://github.com/ladharimedaziz/wargames; school simulation)'
def get(name):
    h = hashlib.md5(name.encode()).hexdigest()
    url = f'https://upload.wikimedia.org/wikipedia/commons/{h[0]}/{h[:2]}/{name}'
    for attempt in range(6):
        time.sleep(2.2)
        dst = os.path.join(scratch, 'img', name)
        r = subprocess.run(['curl', '-sSL', '-m', '60', '-A', UA, '-o', dst, '-w', '%{http_code}', url], capture_output=True, text=True)
        code = r.stdout.strip()
        if code == '200': return dst
        if code == '404': return None
        time.sleep(8 * (attempt + 1))  # 429: back off
    return None
done = {}
for key, names in WANT.items():
    for n in names:
        if get(n): done[key] = n; break
    else:
        done[key] = None
    print(key, done[key], flush=True)
json.dump(done, open(os.path.join(scratch, 'img-result.json'), 'w'), indent=1)
