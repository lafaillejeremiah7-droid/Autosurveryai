"""Tournament rules. No third-party dependencies."""
from copy import deepcopy
from decimal import Decimal
from fractions import Fraction
from itertools import groupby
import math

TIE = 'TIE - EXTRA GAMES NEEDED'
IDS = [f'p{i+1}' for i in range(10)]

def blank_round():
    return {'players': {p: {'team': '', 'goals': [None]*5} for p in IDS}, 'extras': [], 'roster': []}

def new_state():
    return {'version': 1, 'names': {p: '' for p in IDS},
            'settings': {'win_points': 1.5, 'goal_points': 1, 'multiplier': 2, 'prizes': [18,8,4]},
            'round1': blank_round(), 'round2': blank_round(),
            'final': {'players': {p: {'goals': [None]*5, 'results': ['']*5} for p in IDS}, 'extras': [], 'roster': []}}

def numeric(v, nullable=False, integer=False):
    if v is None and nullable: return
    if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not 0 <= v <= 100000:
        raise ValueError('Enter a number from 0 to 100,000.')
    if integer and v != int(v): raise ValueError('Goals must be whole numbers.')

def validate(s):
    try:
        if s['version'] != 1 or set(s['names']) != set(IDS): raise ValueError('Invalid tournament backup.')
        for name in s['names'].values():
            if not isinstance(name,str) or len(name)>40: raise ValueError('Names must be 40 characters or fewer.')
        for k in ['win_points','goal_points','multiplier']: numeric(s['settings'][k])
        if len(s['settings']['prizes']) != 3: raise ValueError('Enter exactly three prizes.')
        for v in s['settings']['prizes']: numeric(v)
        for stage in ['round1','round2','final']:
            a=s[stage]
            if set(a['players'])!=set(IDS) or len(a['extras'])>50: raise ValueError('Invalid player records or too many extra games.')
            if not isinstance(a['roster'],list) or len(a['roster'])!=len(set(a['roster'])) or any(p not in IDS for p in a['roster']):
                raise ValueError('Invalid roster.')
            for d in a['players'].values():
                if len(d['goals'])!=5: raise ValueError('Exactly five regulation games are required.')
                for v in d['goals']: numeric(v,True,True)
                if stage=='final':
                    if len(d['results'])!=5 or any(v not in ['','W','L'] for v in d['results']): raise ValueError('Results must be W or L.')
                elif d['team'] not in ['','A','B']: raise ValueError('Teams must be A or B.')
            for extra in a['extras']:
                if not isinstance(extra,dict) or set(extra)!=set(IDS): raise ValueError('Invalid extra-game records.')
                for value in extra.values():
                    if stage=='final':
                        numeric(value['goals'],True,True)
                        if value['result'] not in ['','W','L']: raise ValueError('Results must be W or L.')
                    else: numeric(value,True,True)
    except (KeyError,TypeError,AttributeError): raise ValueError('This is not a valid tournament backup.')
    return s

def points(goals,result,settings,mult=1):
    # Decimal avoids manufactured podium ties from binary floating-point rounding.
    win=Decimal(str(settings['win_points'])) if result=='W' else Decimal(0)
    goal=Decimal(str(settings['goal_points'])) * (goals or 0)
    m=Decimal(str(mult))
    return win*m,goal*m

def order_groups(ids, scores, extras):
    """Exact primary-score ties are resolved lexicographically by extra games.

    A later game is considered only after every member of the remaining tied
    group has a score in each preceding extra game.
    """
    groups=[list(g) for _,g in groupby(sorted(ids,key=lambda p:scores[p],reverse=True),key=lambda p:scores[p])]
    def split(group, index):
        if len(group)<2 or index>=len(extras): return [group]
        e=extras[index]
        if any(e.get(p) is None for p in group): return [group]
        result=[]
        for _,g in groupby(sorted(group,key=lambda p:e[p],reverse=True),key=lambda p:e[p]):
            result.extend(split(list(g),index+1))
        return result
    return [sub for group in groups for sub in split(group,0)]

def round_view(s, key, roster, names_ok, upstream=True):
    stage=s[key]; size=5 if key=='round1' else 4; cut=size-1
    stale=bool(stage['roster'] and stage['roster']!=roster) if key=='round2' else False
    rows=[]; scores={}; issues=[]
    for p in roster:
        d=stage['players'][p]; played=sum(v is not None for v in d['goals']); total=sum(v or 0 for v in d['goals'])
        scores[p]=Fraction(total,played) if played else Fraction(0)
        rows.append({'id':p,'name':s['names'][p] or f'Player {IDS.index(p)+1}', 'team':d['team'], 'goals':total,'played':played,
                     'average':float(scores[p]),'rank':None,'status':'PENDING'})
    if not upstream: issues.append('Complete the previous round and resolve its cut ties.')
    if stale: issues.append('The survivor list changed. Reset this round before entering new scores.')
    if not names_ok: issues.append('Enter 10 unique player names in Settings.')
    for t in ['A','B']:
        n=sum(r['team']==t for r in rows)
        if n!=size and upstream: issues.append(f'Team {t}: assign {size} players ({n} assigned).')
    games=[]
    for g in range(5):
        counts={t:sum(stage['players'][p]['team']==t and stage['players'][p]['goals'][g] is not None for p in roster) for t in ['A','B']}
        required=5 if key=='round1' else 3
        games.append({'game':g+1,'counts':counts,'ready':all(v==required for v in counts.values())})
    if upstream and not all(g['ready'] for g in games): issues.append('Complete all five games: '+('5' if key=='round1' else '3')+' scores per team per game. Enter 0 for no goals.')
    if key=='round2' and roster and any(r['played']==0 for r in rows): issues.append('Each player must play at least one match to qualify.')
    ready=not issues
    rowmap={r['id']:r for r in rows}
    for t in ['A','B']:
        ids=[r['id'] for r in rows if r['team']==t]; rank=1
        for group in order_groups(ids,scores,stage['extras']):
            tied=rank<=cut<rank+len(group)-1
            for p in group:
                rowmap[p]['rank']=rank
                rowmap[p]['status']=('TIE - EXTRA GAMES NEEDED' if tied else 'ADVANCE' if rank<=cut else 'CUT') if ready else 'PENDING'
            rank+=len(group)
    tied=any(r['status']==TIE for r in rows)
    if tied: issues.append('Play extra games for the highlighted tied players.')
    survivors=[r['id'] for r in rows if r['status']=='ADVANCE'] if ready and not tied else []
    return {'rows':rows,'games':games,'issues':issues,'ready':ready,'complete':ready and not tied,'survivors':survivors,'stale':stale}

def evaluate(s):
    n=[s['names'][p].strip().casefold() for p in IDS]; names_ok=all(n) and len(set(n))==10
    r1=round_view(s,'round1',IDS,names_ok)
    r2=round_view(s,'round2',r1['survivors'],names_ok,r1['complete'])
    roster=r2['survivors']; stage=s['final']; settings=s['settings']; rows=[]; scores={}; issues=[]
    stale=bool(stage['roster'] and stage['roster']!=roster)
    if not r2['complete']: issues.append('Complete Round 2 and resolve its cut ties.')
    if stale: issues.append('The finalist list changed. Reset the final before entering new scores.')
    for p in roster:
        d=stage['players'][p]; wins=Decimal(0); goals=Decimal(0); game_points=[]
        for g in range(5):
            if d['goals'][g] is None or not d['results'][g]: game_points.append(None); continue
            w,h=points(d['goals'][g],d['results'][g],settings,settings['multiplier'] if g<2 else 1)
            wins+=w; goals+=h; game_points.append(float(w+h))
        scores[p]=wins+goals
        rows.append({'id':p,'name':s['names'][p],'win_points':float(wins),'goal_points':float(goals),'total':float(wins+goals),
                     'game_points':game_points,'rank':None,'prize':None,'status':'PENDING'})
    games=[]
    for g in range(5):
        count=sum(stage['players'][p]['goals'][g] is not None for p in roster)
        w=sum(stage['players'][p]['results'][g]=='W' for p in roster); l=sum(stage['players'][p]['results'][g]=='L' for p in roster)
        games.append({'game':g+1,'scores':count,'wins':w,'losses':l,'ready':count==6 and w==3 and l==3})
    if roster and not all(g['ready'] for g in games): issues.append('Every game needs six goal scores, three W results, and three L results.')
    ready=not issues; extra_scores=[]
    for extra in stage['extras']:
        extra_scores.append({p:sum(points(d['goals'],d['result'],settings)) if d['goals'] is not None and d['result'] else None for p,d in extra.items()})
    rank=1; rowmap={r['id']:r for r in rows}
    for group in order_groups(roster,scores,extra_scores):
        tied=rank<=3 and len(group)>1
        for p in group:
            r=rowmap[p];r['rank']=rank
            r['status']=(TIE if tied else 'FINAL') if ready else 'PENDING'
            r['prize']=settings['prizes'][rank-1] if ready and not tied and rank<=3 else (0 if ready and not tied else None)
        rank+=len(group)
    rows.sort(key=lambda r:r['rank'])
    if any(r['status']==TIE for r in rows): issues.append('Podium tie: play extra games for the highlighted players. Those prizes stay unassigned.')
    final={'rows':rows,'games':games,'issues':issues,'ready':ready,'complete':ready and not any(r['status']==TIE for r in rows),'stale':stale}
    return {'round1':r1,'round2':r2,'final':final,'pool':sum(settings['prizes']),
            'awarded':sum(r['prize'] or 0 for r in rows),'names_ok':names_ok}

def bind_rosters(s):
    """Bind downstream inputs once. A changed roster must be explicitly reset."""
    view=evaluate(s)
    for key,ids in [('round2',view['round1']['survivors']),('final',view['round2']['survivors'])]:
        if not s[key]['roster'] and ids: s[key]['roster']=ids
    return s
