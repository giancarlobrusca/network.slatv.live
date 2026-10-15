#!/usr/bin/env python3
"""Refresh X (Twitter) interactions for data/constellation.json.

For each person with social.x (plus the SLA hub), run one full-archive search
   from:<A> (@B OR @C ...) -is:retweet
and classify each returned post per target as reply (in_reply_to_user_id),
quote (quoted post author) or mention (@handle in the text). Aggregates into
data.interactions = [{source,target,type,count,examples[<=3 urls],lastAt}].

Follows are NOT collected: no followers/following endpoint was available.

Needs an X API bearer token in the environment (never commit it):
   X_BEARER_TOKEN=... python3 scripts/fetch-x.py            # writes data/constellation.json
   python3 scripts/fetch-x.py --from-raw scripts/raw/x-posts.json   # rebuild offline
"""
import collections, json, os, re, sys, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data', 'constellation.json')
API = 'https://api.x.com/2/tweets/search/all'


def accounts(d):
    acc = {d['hub']['social']['x']: d['hub']['id']} if d.get('hub') else {}
    for p in d['people']:
        if (p.get('social') or {}).get('x'):
            acc[p['social']['x']] = p['id']
    return acc


def search(query, token):
    q = urllib.parse.urlencode({'query': query, 'max_results': 100,
                                'tweet.fields': 'created_at,author_id,in_reply_to_user_id,referenced_tweets',
                                'expansions': 'referenced_tweets.id.author_id,author_id'})
    req = urllib.request.Request(f'{API}?{q}', headers={'Authorization': f'Bearer {token}'})
    with urllib.request.urlopen(req) as r:
        return json.load(r)


def classify(posts, users, quoted_authors, acc):
    low = {h.lower(): h for h in acc}
    agg = collections.defaultdict(list)
    for p in posts:
        src = users.get(p['author_id'])
        if src not in acc:
            continue
        tg = {}
        rep = users.get(p.get('in_reply_to_user_id'))
        if rep in acc:
            tg[rep] = 'reply'
        for r in p.get('referenced_tweets') or []:
            qa = users.get(quoted_authors.get(r['id']))
            if r['type'] == 'quoted' and qa in acc:
                tg.setdefault(qa, 'quote')
        for u in re.findall(r'@(\w{1,15})', p['text']):
            if u.lower() in low:
                tg.setdefault(low[u.lower()], 'mention')
        url = p.get('url') or f"https://x.com/{src}/status/{p['id']}"
        for t, ty in tg.items():
            if t != src:
                agg[(acc[src], acc[t], ty)].append((p['created_at'], url))
    out = []
    for (s, t, ty), v in sorted(agg.items()):
        v.sort(reverse=True)
        out.append({'source': s, 'target': t, 'type': ty, 'count': len(v), 'examples': [u for _, u in v[:3]], 'lastAt': v[0][0]})
    return out


def main():
    d = json.load(open(DATA))
    acc = accounts(d)
    ids = {(p.get('social') or {}).get('xId'): p['social']['x'] for p in d['people'] if (p.get('social') or {}).get('xId')}
    if d.get('hub'):
        ids[d['hub']['social']['xId']] = d['hub']['social']['x']
    if '--from-raw' in sys.argv:
        posts = json.load(open(sys.argv[sys.argv.index('--from-raw') + 1]))
        quoted = {}
    else:
        token = os.environ.get('X_BEARER_TOKEN') or sys.exit('Set X_BEARER_TOKEN')
        posts, quoted = [], {}
        for h in acc:
            others = ' OR '.join('@' + o for o in acc if o != h)
            j = search(f'from:{h} ({others}) -is:retweet', token)
            posts += j.get('data', [])
            quoted.update({x['id']: x['author_id'] for x in j.get('includes', {}).get('tweets', [])})
            time.sleep(1.1)
    d['interactions'] = classify(posts, ids, quoted, acc)
    json.dump(d, open(DATA, 'w'), indent=1, ensure_ascii=False)
    print(f"{len(d['interactions'])} interactions written")


if __name__ == '__main__':
    main()
