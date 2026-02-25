#!/usr/bin/env python3
"""Publish scheduled blog posts for today's date."""
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

print(f'Publishing posts for {today}...')

files = sorted(glob.glob(f'{scheduled_dir}/*.html'))
if not files:
    print('No HTML files found')
    exit(0)

dt = datetime.strptime(today, '%Y-%m-%d')
display_date = f'{dt.year}년 {dt.month}월 {dt.day}일'

new_entries = []

for filepath in files:
    filename = os.path.basename(filepath)

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    for dest in [f'posts/{filename}', f'public/posts/{filename}']:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        with open(dest, 'w', encoding='utf-8') as f:
            f.write(content)

    match = re.search(r'<h1>([^<]+)</h1>', content)
    title = match.group(1) if match else filename

    entry = (
        f'      <li class="post-item">\n'
        f'        <a href="posts/{filename}">\n'
        f'          <span class="post-category">버스</span>\n'
        f'          <h2>{title}</h2>\n'
        f'          <p class="post-meta">{display_date}</p>\n'
        f'        </a>\n'
        f'      </li>'
    )
    new_entries.append(entry)

    sitemap_entry = (
        f'  <url>\n'
        f'    <loc>https://crbuses.com/posts/{filename}</loc>\n'
        f'    <lastmod>{today}</lastmod>\n'
        f'    <changefreq>weekly</changefreq>\n'
        f'    <priority>0.8</priority>\n'
        f'  </url>'
    )

    for sm in ['sitemap.xml', 'public/sitemap.xml']:
        if os.path.exists(sm):
            with open(sm, 'r', encoding='utf-8') as f:
                sm_content = f.read()
            sm_content = sm_content.replace('</urlset>', f'{sitemap_entry}\n</urlset>')
            with open(sm, 'w', encoding='utf-8') as f:
                f.write(sm_content)

    print(f'Published: {filename} - {title}')

if new_entries:
    insert_block = '\n' + '\n'.join(new_entries)
    for idx in ['index.html', 'public/index.html']:
        if os.path.exists(idx):
            with open(idx, 'r', encoding='utf-8') as f:
                content = f.read()
            content = content.replace('<!-- NEW_POSTS -->', f'<!-- NEW_POSTS -->{insert_block}')
            with open(idx, 'w', encoding='utf-8') as f:
                f.write(content)

shutil.rmtree(scheduled_dir)
print(f'Done! Published {len(files)} posts for {today}')
