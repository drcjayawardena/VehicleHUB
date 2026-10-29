/* VehicleHub — the years each model was made: [first, last] (0 = still made).
 * Used by the New Call forms so the Year list only shows years the chosen model exists.
 * Names are matched ignoring case, spaces and dashes (CHR = C-HR, HiAce = Hiace).
 * A model that is not listed here shows every year from VH_FIRST_YEAR.
 * Same data as request.html, plus the models in the VehicleHub make/model list. */
window.VH_FIRST_YEAR = 1980;
window.VH_YEARS = {
  "Toyota": { "Aqua": [2011, 0], "Allion": [2001, 2021], "Axio": [2006, 0], "Belta": [2005, 0], "Camry": [1990, 0],
    "C-HR": [2016, 0], "Corolla": [1990, 0], "Fortuner": [2005, 0], "Hiace": [1990, 0], "Hilux": [1990, 0], "KDH": [2004, 0],
    "Land Cruiser": [1990, 0], "Land Cruiser Prado": [1990, 0], "Passo": [2004, 0], "Premio": [2001, 2021], "Prius": [1997, 0],
    "Raize": [2019, 0], "Roomy": [2016, 0], "Rush": [2006, 0], "Vitz": [1999, 2019], "Yaris": [2005, 0],
    "RAV4": [1994, 0], "Noah": [2001, 0], "Townace": [1980, 0], "Coaster": [1980, 0], "Dyna": [1980, 0] },
  "Suzuki": { "A-Star": [2008, 2015], "Alto": [1990, 0], "Celerio": [2008, 0], "Dzire": [2008, 0], "Ertiga": [2012, 0],
    "Every": [1990, 0], "Estilo": [2006, 2014], "Hustler": [2014, 0], "Jimny": [1990, 0], "Spacia": [2013, 0],
    "Swift": [2000, 0], "Vitara": [1990, 0], "Wagon R": [1993, 0], "Wagon R FX": [2003, 2017], "Wagon R Stingray": [2007, 0] },
  "Honda": { "Civic": [1990, 0], "CR-V": [1995, 0], "Fit": [2001, 0], "Fit Shuttle": [2011, 2015], "Freed": [2008, 0],
    "Grace": [2014, 2020], "Insight": [1999, 2022], "Vezel": [2013, 0], "WR-V": [2017, 0],
    "CB Shine": [2006, 0], "CD 125": [1990, 0], "Dio": [1990, 0], "Hornet": [2015, 0], "X-Blade": [2018, 0] },
  "Nissan": { "Caravan": [1990, 0], "Dayz": [2013, 0], "Leaf": [2010, 0], "March": [1990, 0], "Navara": [1997, 0],
    "Note": [2004, 0], "Sunny": [1990, 0], "Tiida": [2004, 2016], "X-Trail": [2000, 0],
    "NV200": [2009, 0], "Vanette": [1980, 2017] },
  "Mitsubishi": { "Lancer": [1990, 2017], "Montero": [1990, 2021], "Outlander": [2001, 0], "Pajero": [1990, 2021],
    "L200": [1990, 0], "Eclipse Cross": [2017, 0], "Mirage": [1990, 0], "eK Wagon": [2001, 0], "Canter": [1980, 0] },
  "Mazda": { "Axela": [2003, 2019], "BT-50": [2006, 0], "CX-3": [2015, 0], "CX-5": [2012, 0], "Demio": [1996, 2019],
    "Familia": [1990, 2004], "Bongo": [1980, 0] },
  "Micro": { "Panda": [2008, 2014], "Trend": [2010, 2015], "MX7": [2011, 2015], "Actyon": [2006, 2015],
    "Kyron": [2005, 2014], "Rexton": [2001, 2015] },
  "Hyundai": { "Accent": [1994, 0], "Creta": [2014, 0], "Elantra": [1990, 0], "Grand i10": [2013, 0], "i20": [2008, 0],
    "Santa Fe": [2000, 0], "Tucson": [2004, 0], "Venue": [2019, 0] },
  "Kia": { "Picanto": [2004, 0], "Rio": [1999, 0], "Sorento": [2002, 0], "Sportage": [1993, 0], "Sonet": [2020, 0],
    "Stonic": [2017, 0] },
  "Daihatsu": { "Boon": [2004, 0], "Hijet": [1990, 0], "Mira": [1990, 0], "Move": [1995, 0], "Rocky": [2019, 0],
    "Tanto": [2003, 0], "Terios": [1997, 0] },
  "Perodua": { "Axia": [2014, 0], "Bezza": [2016, 0], "Kelisa": [2001, 2007], "Myvi": [2005, 0], "Viva": [2007, 2014] },
  "Tata": { "Ace": [2005, 0], "Indica": [1998, 2018], "Nano": [2008, 2019], "Super Ace": [2008, 0], "Xenon": [2007, 0] },
  "Mahindra": { "Bolero": [2000, 0], "KUV100": [2016, 0], "Maxximo": [2010, 0], "Scorpio": [2002, 0], "XUV500": [2011, 2021] },
  "Isuzu": { "D-Max": [2002, 0], "Elf": [1980, 0] },
  "Bajaj": { "RE": [1990, 0], "RE Three Wheeler": [1990, 0], "Discover": [2004, 0], "Platina": [2006, 0], "Pulsar": [2001, 0],
    "CT 100": [2004, 0] },
  "TVS": { "King": [2008, 0], "King Three Wheeler": [2008, 0], "Apache": [2005, 0], "Metro": [2009, 0], "Ntorq": [2018, 0],
    "Scooty": [2005, 0], "Scooty Pep": [2005, 0], "Wego": [2010, 0] },
  "Hero": { "Dash": [2014, 0], "Destini": [2018, 0], "Hunk": [2007, 0], "Maestro": [2012, 0], "Pleasure": [2006, 0],
    "Splendor": [1994, 0] },
  "Yamaha": { "FZ": [2008, 0], "Fascino": [2015, 0], "Ray ZR": [2016, 0], "R15": [2008, 0] }
};
