import urllib.request
import gzip
import csv
import json
import os

URL = "https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/v3/hyg_v38.csv.gz"
OUTPUT_FILE = "stars.json"
MAX_MAGNITUDE = 6.5

def fetch_stars():
    print(f"Downloading HYG database from {URL}...")
    req = urllib.request.Request(URL, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req) as response:
        with gzip.GzipFile(fileobj=response) as gz:
            lines = [line.decode('utf-8') for line in gz.readlines()]
    print("Parsing CSV...")
    reader = csv.DictReader(lines)
    stars = []
    
    for row in reader:
        try:
            mag = float(row['mag'])
            if mag <= MAX_MAGNITUDE:
                star = {
                    'r': float(row['ra']),   # Right Ascension in hours
                    'd': float(row['dec']),  # Declination in degrees
                    'm': mag,
                }
                if row['proper']:
                    star['n'] = row['proper'] # Proper name
                elif row['con']:
                    star['c'] = row['con'] # Constellation abbreviation if we want to show it later
                stars.append(star)
        except (ValueError, KeyError):
            pass
            
    print(f"Filtered {len(stars)} stars with magnitude <= {MAX_MAGNITUDE}")
    
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(stars, f, separators=(',', ':')) # compact JSON
    print(f"Saved to {OUTPUT_FILE} ({os.path.getsize(OUTPUT_FILE) / 1024:.1f} KB)")

if __name__ == "__main__":
    fetch_stars()
