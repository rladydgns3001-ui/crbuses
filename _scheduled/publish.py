#!/usr/bin/env python3
"""Publish scheduled guide posts for today's date.

New URL structure: /guide/{slug}/index.html
Scheduled files: _scheduled/YYYY-MM-DD/{slug}.html
Each file must contain: <meta name="guide-category" content="{category}">
"""
import os
import re
import glob
import shutil
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
today = datetime.now(KST).strftime('%Y-%m-%d')
scheduled_dir = f'_scheduled/{today}'

if not os.path.isdir(scheduled_dir):
    print(f'No scheduled posts for {today}')
    exit(0)

print(f'Publishing guides for {today}...')

files = sorted(glob.glob(f'{scheduled_dir}/*.html'))
if not files:
    print('No HTML files found')
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

for filepath in files:
    filename = os.path.basename(filepath)
    slug = os.path.splitext(filename)[0]

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
            # Insert before closing card-grid div
            hub_content = hub_content.replace(
                '      </div>\n    </section>',
                f'{card_html}\n      </div>\n    </section>',
                1
            )
            with open(hub, 'w', encoding='utf-8') as f:
                f.write(hub_content)

    print(f'Published: {slug} [{category}] - {title}')

shutil.rmtree(scheduled_dir)
print(f'Done! Published {len(files)} guides for {today}')
