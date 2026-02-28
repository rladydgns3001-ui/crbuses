#!/usr/bin/env python3
"""Publish scheduled guide posts for today's date.

New URL structure: /guide/{slug}/index.html
Scheduled files: _scheduled/YYYY-MM-DD/{slot}_{slug}.html
Each file must contain: <meta name="guide-category" content="{category}">

Slots:
  --slot 1  → publish 1_*.html files (09:00 KST)
  --slot 2  → publish 2_*.html files (13:00 KST), delete folder after
"""
import os
import re
import glob
import shutil
import argparse
import urllib.request
import json
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
today = datetime.now(KST).strftime('%Y-%m-%d')
scheduled_dir = f'_scheduled/{today}'

# Parse slot argument
parser = argparse.ArgumentParser()
parser.add_argument('--slot', type=int, choices=[1, 2], required=True)
args = parser.parse_args()
slot = args.slot

if not os.path.isdir(scheduled_dir):
    print(f'No scheduled posts for {today}')
    exit(0)

print(f'Publishing slot {slot} guides for {today}...')

files = sorted(glob.glob(f'{scheduled_dir}/{slot}_*.html'))
if not files:
    print(f'No slot {slot} files found')
    exit(0)

dt = datetime.strptime(today, '%Y-%m-%d')
display_date = f'{dt.year}년 {dt.month}월 {dt.day}일'

# Category display names
CATEGORY_NAMES = {
    'intercity': '시외버스',
    'express': '고속버스',
    'city': '시내버스',
    'airport': '공항버스',
    'night': '심야버스',
    'village': '마을버스',
    'fare': '요금·할인',
    'charter': '전세버스',
    'safety': '안전·정책',
    'tips': '이용 팁',
}

published = []

for filepath in files:
    filename = os.path.basename(filepath)
    # Remove slot prefix: "1_slug.html" → "slug"
    slug = os.path.splitext(filename)[0]
    slug = re.sub(r'^\d+_', '', slug)

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Extract category from meta tag
    cat_match = re.search(r'<meta\s+name="guide-category"\s+content="([^"]+)"', content)
    category = cat_match.group(1) if cat_match else 'tips'

    # Extract title from h1
    title_match = re.search(r'<h1>([^<]+)</h1>', content)
    title = title_match.group(1) if title_match else slug

    # Extract description from meta description
    desc_match = re.search(r'<meta\s+name="description"\s+content="([^"]+)"', content)
    description = desc_match.group(1) if desc_match else title

    # Copy to guide/{slug}/index.html in both root and public
    for base in ['', 'public/']:
        dest_dir = f'{base}guide/{slug}'
        os.makedirs(dest_dir, exist_ok=True)
        dest = f'{dest_dir}/index.html'
        with open(dest, 'w', encoding='utf-8') as f:
            f.write(content)

    # Update sitemap.xml
    sitemap_entry = (
        f'  <url>\n'
        f'    <loc>https://crbuses.com/guide/{slug}/</loc>\n'
        f'    <lastmod>{today}</lastmod>\n'
        f'    <changefreq>weekly</changefreq>\n'
        f'    <priority>0.8</priority>\n'
        f'    <image:image>\n'
        f'      <image:loc>https://crbuses.com/images/{category}.svg</image:loc>\n'
        f'      <image:title>{title}</image:title>\n'
        f'    </image:image>\n'
        f'  </url>'
    )

    for sm in ['sitemap.xml', 'public/sitemap.xml']:
        if os.path.exists(sm):
            with open(sm, 'r', encoding='utf-8') as f:
                sm_content = f.read()
            sm_content = sm_content.replace('</urlset>', f'{sitemap_entry}\n</urlset>')
            with open(sm, 'w', encoding='utf-8') as f:
                f.write(sm_content)

    # Add card to hub page
    card_html = (
        f'        <div class="card-item">\n'
        f'          <a href="/guide/{slug}/">\n'
        f'            <h3>{title}</h3>\n'
        f'            <p>{description[:60]}</p>\n'
        f'          </a>\n'
        f'        </div>'
    )

    for hub in [f'{category}/index.html', f'public/{category}/index.html']:
        if os.path.exists(hub):
            with open(hub, 'r', encoding='utf-8') as f:
                hub_content = f.read()
            hub_content = hub_content.replace(
                '      </div>\n    </section>',
                f'{card_html}\n      </div>\n    </section>',
                1
            )
            with open(hub, 'w', encoding='utf-8') as f:
                f.write(hub_content)

    published.append({
        'title': title,
        'category': CATEGORY_NAMES.get(category, category),
        'slug': slug,
        'url': f'https://crbuses.com/guide/{slug}/',
    })
    print(f'Published: {slug} [{category}] - {title}')

# Delete folder logic:
# - Slot 2: always delete folder after publishing
# - Slot 1: delete folder only if no slot 2 files exist
remaining = glob.glob(f'{scheduled_dir}/2_*.html')
if slot == 2 or not remaining:
    shutil.rmtree(scheduled_dir)
    print(f'Cleaned up {scheduled_dir}')

print(f'Done! Published {len(published)} guides for {today} (slot {slot})')

# Send Telegram notification
bot_token = os.environ.get('TELEGRAM_BOT_TOKEN')
if bot_token and published:
    chat_id = '6479449866'
    lines = [f'📢 발행 완료 ({today} 슬롯{slot})']
    for p in published:
        lines.append(f"\n📝 {p['title']}")
        lines.append(f"  카테고리: {p['category']}")
        lines.append(f"  URL: {p['url']}")
    message = '\n'.join(lines)

    payload = json.dumps({
        'chat_id': chat_id,
        'text': message,
        'parse_mode': 'HTML',
    }).encode('utf-8')

    url = f'https://api.telegram.org/bot{bot_token}/sendMessage'
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f'Telegram notification sent ({resp.status})')
    except Exception as e:
        print(f'Telegram notification failed: {e}')
elif not bot_token:
    print('TELEGRAM_BOT_TOKEN not set, skipping notification')
