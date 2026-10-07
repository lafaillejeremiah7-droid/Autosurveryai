"""Tournament rules. No third-party dependencies."""
from copy import deepcopy
from decimal import Decimal
from fractions import Fraction
from itertools import groupby, combinations
import math
import secrets

TIE = 'TIE - EXTRA GAMES NEEDED'
IDS = [f'p{i+1}' for i in range(10)]

def blank_draw():
    return {'order':[], 'revealed':0, 'completed':0, 'mode':'random'}

def blank_round(games=5):
    return {'players': {p: {**({'team': ''} if games==5 else {}), 'goals': [None]*games} for p in IDS}, 'extras': [], 'roster': [], **({'assigned':[]} if games==5 else {}), **({'draw':blank_draw()} if games==8 else {})}

def new_state():
    return {'version': 4, 'wheel': {'text': '', 'remove_winner': False}, 'names': {p: '' for p in IDS},
            'settings': {'win_points': 1, 'goal_points': 1.5, 'multiplier': 2, 'prizes': [18,8,4]},
            'round1': blank_round(), 'round2': blank_round(8),
            'final': {'players': {p: {'goals': [None]*10, 'results': ['']*10} for p in IDS}, 'extras': [], 'roster': []}}

def final_schedule(roster):
    """One representative of each unordered 3v3 partition of six players."""
    if len(roster) != 6: return []
    return [{'game': i+1, 'A': [roster[0], *pair],
             'B': [p for p in roster if p not in (roster[0], *pair)]}
            for i, pair in enumerate(combinations(roster[1:], 2))]

def round2_schedule(roster):
    """Eight 3v3 matches: six plays/two rests, all pairs meet on both sides.

    Cyclic shifts cover all eight slots. Alternating even and odd shifts
    separates both rest days and gives three plays in each half of the round.
    """
    if len(roster)!=8: return []
    base={'A':(2,3,6), 'B':(4,5,7), 'sit':(0,1)}
    return [{'game':i+1, **{t:[roster[(p+shift)%8] for p in slots] for t,slots in base.items()}}
            for i,shift in enumerate((0,2,4,6,1,3,5,7))]

def has_inputs(stage):
    return bool(stage['extras']) or any(d.get('team') or any(v is not None for v in d['goals']) or any(d.get('results',[])) for d in stage['players'].values())

def migrate(s):
    if s.get('version')==3:
        s=deepcopy(s);stage=s['round2'];draw=blank_draw()
        if has_inputs(stage):
            roster=stage['roster'] or round1_view(s,True)['survivors']
            if len(roster)!=8: raise ValueError('Old Round 2 scores need their original eight-player roster.')
            stage['roster']=roster
            schedule=round2_schedule(roster);completed=0;last=0
            for i,g in enumerate(schedule):
                ready=all(stage['players'][p]['goals'][i] is not None for p in g['A']+g['B']) and all(stage['players'][p]['goals'][i] is None for p in g['sit'])
                if i==completed and ready: completed+=1
                if any(d['goals'][i] is not None for d in stage['players'].values()): last=i+1
            draw={'order':list(roster),'revealed':max(last,min(completed+1,8)),'completed':completed,'mode':'preserved'}
        stage['draw']=draw;s['version']=4
        return s
    if s.get('version') not in (1,2): return s
    s=deepcopy(s)
    if s['version']==1:
        old=s['final']
        if has_inputs(old):
            s['legacy_final']={'settings':deepcopy(s['settings']), 'final':deepcopy(old)}
        s['final']=new_state()['final']
        s['settings']['win_points']=1
        s['settings']['goal_points']=1.5
    # Previous Round 2 inputs describe fixed teams, not the new rotation.
    # Retain all old Round 2/final records in downloadable backups.
    if has_inputs(s['round2']) or has_inputs(s['final']):
        s['legacy_round2']={'round2':deepcopy(s['round2']), 'final':deepcopy(s['final']), 'settings':deepcopy(s['settings'])}
    s['round2']=blank_round(8)
    s['final']=new_state()['final']
    s['version']=3
    return migrate(s)

def numeric(v, nullable=False, integer=False):
    if v is None and nullable: return
    if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not 0 <= v <= 100000:
        raise ValueError('Enter a number from 0 to 100,000.')
    if integer and v != int(v): raise ValueError('Goals must be whole numbers.')

def validate(s):
    try:
        s=migrate(s)
        s.setdefault('wheel', {'text': '', 'remove_winner': False})
        if not isinstance(s['wheel'],dict) or not isinstance(s['wheel'].get('text'),str) or not isinstance(s['wheel'].get('remove_winner'),bool):
            raise ValueError('Invalid wheel list or removal setting.')
        if s['version'] != 4 or set(s['names']) != set(IDS): raise ValueError('Invalid tournament backup.')
        for name in s['names'].values():
            if not isinstance(name,str) or len(name)>40: raise ValueError('Names must be 40 characters or fewer.')
        for k in ['win_points','goal_points','multiplier']: numeric(s['settings'][k])
        if len(s['settings']['prizes']) != 3: raise ValueError('Enter exactly three prizes.')
        for v in s['settings']['prizes']: numeric(v)
        s['round1'].setdefault('assigned',[])
        assigned=s['round1']['assigned']
        if not isinstance(assigned,list) or len(assigned)!=len(set(assigned)) or any(p not in IDS for p in assigned):
            raise ValueError('Invalid wheel-assigned player list.')
        for p in assigned:
            if s['round1']['players'][p]['team'] not in ['A','B']: raise ValueError('Wheel-assigned players must have a team.')
        for stage in ['round1','round2','final']:
            a=s[stage]
            if set(a['players'])!=set(IDS) or len(a['extras'])>50: raise ValueError('Invalid player records or too many extra games.')
            if not isinstance(a['roster'],list) or len(a['roster'])!=len(set(a['roster'])) or any(p not in IDS for p in a['roster']):
                raise ValueError('Invalid roster.')
            if stage=='round2':
                draw=a['draw'];order=draw['order']
                if not isinstance(order,list) or (order and (len(order)!=8 or len(set(order))!=8 or set(order)!=set(a['roster']))):
                    raise ValueError('Invalid saved Round 2 draw order.')
                if any(type(draw[k]) is not int or not 0<=draw[k]<=8 for k in ['revealed','completed']):
                    raise ValueError('Invalid Round 2 match progress.')
                if draw['mode'] not in ['random','preserved'] or draw['completed']>draw['revealed']:
                    raise ValueError('Invalid Round 2 draw progress.')
                if not order and (draw['revealed'] or draw['completed']): raise ValueError('Draw the first match before recording progress.')
                if order and draw['revealed']<1: raise ValueError('A saved draw must reveal its first match.')
            for d in a['players'].values():
                if len(d['goals'])!={'round1':5,'round2':8,'final':10}[stage]: raise ValueError('To Live needs 5 games, To Die 8 games, and Rebirth 10 games.')
                for v in d['goals']: numeric(v,True,True)
                if stage=='final':
                    if len(d['results'])!=10 or any(v not in ['','W','L'] for v in d['results']): raise ValueError('Results must be W or L.')
                elif stage=='round1' and d['team'] not in ['','A','B']: raise ValueError('Teams must be A or B.')
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

def round1_view(s, names_ok):
    stage=s['round1'];roster=IDS;size=5;cut=4;stale=False
    rows=[]; scores={}; issues=[]
    for p in roster:
        d=stage['players'][p]; played=sum(v is not None for v in d['goals']); total=sum(v or 0 for v in d['goals'])
        scores[p]=Fraction(total,played) if played else Fraction(0)
        rows.append({'id':p,'name':s['names'][p] or f'Player {IDS.index(p)+1}', 'team':d['team'], 'goals':total,'played':played,
                     'average':float(scores[p]),'rank':None,'status':'PENDING'})
    if not names_ok: issues.append('Enter 10 unique player names in Players & rules.')
    for t in ['A','B']:
        n=sum(r['team']==t for r in rows)
        if n!=size: issues.append(f'Team {t}: assign {size} players ({n} assigned).')
    games=[]
    for g in range(5):
        counts={t:sum(stage['players'][p]['team']==t and stage['players'][p]['goals'][g] is not None for p in roster) for t in ['A','B']}
        required=5
        games.append({'game':g+1,'counts':counts,'ready':all(v==required for v in counts.values())})
    if not all(g['ready'] for g in games): issues.append('Complete all five games: 5 scores per team per game. Enter 0 for no goals.')
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

def round2_view(s, roster, names_ok, upstream=True):
    stage=s['round2'];draw=stage['draw'];schedule=round2_schedule(draw['order']);rows=[];scores={};issues=[]
    stale=bool(stage['roster'] and stage['roster']!=roster)
    if not upstream: issues.append('Complete To Live and resolve its cut ties.')
    if stale: issues.append('The survivor list changed. Reset To Die before entering new scores.')
    if not names_ok: issues.append('Enter 10 unique player names in Players & rules.')
    if not draw['order']: issues.append('Draw Match 1 sit-outs to start To Die.')
    games=[]
    for match in schedule:
        g=match['game']-1
        counts={t:sum(stage['players'][p]['goals'][g] is not None for p in match[t]) for t in ['A','B']}
        rest_blank=all(stage['players'][p]['goals'][g] is None for p in match['sit'])
        games.append({'game':g+1,'counts':counts,'ready':all(n==3 for n in counts.values()) and rest_blank})
        if not rest_blank: issues.append(f'Game {g+1}: both scheduled sit-outs must stay blank.')
    if upstream and (len(games)!=8 or not all(g['ready'] for g in games)):
        issues.append('Complete all eight games: score the six scheduled players, including 0 for no goals. Leave the two sit-outs blank.')
    for p in roster:
        eligible=[i for i,g in enumerate(schedule) if p in g['A']+g['B']]
        values=[stage['players'][p]['goals'][i] for i in eligible]
        played=sum(v is not None for v in values);total=sum(v or 0 for v in values)
        scores[p]=Fraction(total,played) if played else Fraction(0)
        rows.append({'id':p,'name':s['names'][p], 'goals':total,'played':played,'average':float(scores[p]),
                     'rank':None,'status':'PENDING','sit_outs':sum(p in g['sit'] for g in schedule[:draw['revealed']])})
    if draw['completed']<8: issues.append('Mark each match done after entering its six scores.')
    ready=not issues;rowmap={r['id']:r for r in rows};rank=1
    for group in order_groups(roster,scores,stage['extras']):
        tied=rank<=6<rank+len(group)-1
        for p in group:
            rowmap[p]['rank']=rank
            rowmap[p]['status']=(TIE if tied else 'ADVANCE' if rank<=6 else 'CUT') if ready else 'PENDING'
        rank+=len(group)
    tied=any(r['status']==TIE for r in rows)
    if tied: issues.append('Tie across 6th and 7th: play extra games for the highlighted players.')
    survivors=[p for p in roster if rowmap[p]['status']=='ADVANCE'] if ready and not tied else []
    rows.sort(key=lambda r:r['rank'])
    return {'rows':rows,'games':games,'schedule':schedule,'draw':deepcopy(draw),'issues':issues,'ready':ready,'complete':ready and not tied,'survivors':survivors,'stale':stale}

def evaluate(s):
    n=[s['names'][p].strip().casefold() for p in IDS]; names_ok=all(n) and len(set(n))==10
    r1=round1_view(s,names_ok)
    r2=round2_view(s,r1['survivors'],names_ok,r1['complete'])
    roster=r2['survivors']; stage=s['final']; settings=s['settings']; rows=[]; scores={}; issues=[]
    stale=bool(stage['roster'] and stage['roster']!=roster)
    if not r2['complete']: issues.append('Complete To Die and resolve its cut ties.')
    if stale: issues.append('The finalist list changed. Reset the final before entering new scores.')
    for p in roster:
        d=stage['players'][p]; wins=Decimal(0); goals=Decimal(0); game_points=[]
        for g in range(10):
            if d['goals'][g] is None and not d['results'][g]: game_points.append(None); continue
            w,h=points(d['goals'][g],d['results'][g],settings,settings['multiplier'] if g<2 else 1)
            wins+=w; goals+=h; game_points.append(float(w+h))
        scores[p]=wins+goals
        rows.append({'id':p,'name':s['names'][p],'win_points':float(wins),'goal_points':float(goals),'total':float(wins+goals),
                     'goals':sum(v or 0 for v in d['goals']),'wins':sum(v=='W' for v in d['results']),
                     'played':sum(d['goals'][g] is not None and bool(d['results'][g]) for g in range(10)),
                     'game_points':game_points,'rank':None,'prize':None,'status':'PENDING'})
    schedule=final_schedule(roster)
    games=[]
    for g in range(10):
        count=sum(stage['players'][p]['goals'][g] is not None for p in roster)
        w=sum(stage['players'][p]['results'][g]=='W' for p in roster); l=sum(stage['players'][p]['results'][g]=='L' for p in roster)
        teams=schedule[g] if schedule else {'A':[], 'B':[]}
        outcomes=[{stage['players'][p]['results'][g] for p in teams[t]} for t in ['A','B']]
        consistent=outcomes in [[{'W'},{'L'}],[{'L'},{'W'}]]
        games.append({'game':g+1,'scores':count,'wins':w,'losses':l,'teams':teams,
                      'ready':count==6 and consistent})
    if roster and not all(g['ready'] for g in games): issues.append('Complete all ten games: six goal scores each, with W for the scheduled winning team and L for its opponents.')
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
    final={'schedule':schedule,'rows':rows,'games':games,'issues':issues,'ready':ready,'complete':ready and not any(r['status']==TIE for r in rows),'stale':stale}
    return {'round1':r1,'round2':r2,'final':final,'pool':sum(settings['prizes']),
            'awarded':sum(r['prize'] or 0 for r in rows),'names_ok':names_ok}

def bind_rosters(s):
    """Bind downstream inputs once. A changed roster must be explicitly reset."""
    view=evaluate(s)
    for key,ids in [('round2',view['round1']['survivors']),('final',view['round2']['survivors'])]:
        if not s[key]['roster'] and ids: s[key]['roster']=ids
    return s


def round2_draw_action(s, action, game=None):
    s=deepcopy(s);view=evaluate(s);stage=s['round2'];draw=stage['draw']
    if not view['round1']['complete'] or view['round2']['stale']:
        raise ValueError('Complete To Live and resolve any changed Round 2 roster first.')
    if action=='start':
        if draw['order']: return s  # Repeat clicks/retries never reroll a saved draw.
        if has_inputs(stage): raise ValueError('Existing scores cannot be assigned to a new draw.')
        order=list(view['round1']['survivors']);secrets.SystemRandom().shuffle(order)
        stage['roster']=list(view['round1']['survivors'])
        stage['draw']={'order':order,'revealed':1,'completed':0,'mode':'random'}
    elif action=='done':
        if not draw['order']: raise ValueError('Draw Match 1 sit-outs first.')
        if type(game) is not int or game!=draw['completed']+1 or not 1<=game<=8 or game>draw['revealed']:
            raise ValueError('Complete the current match in order. This match may already be marked done.')
        if not all(g['ready'] for g in view['round2']['games'][:game]):
            raise ValueError('Enter all six goal scores, including zeros, and leave both sit-outs blank before marking the match done.')
        draw['completed']=game;draw['revealed']=max(draw['revealed'],min(game+1,8))
    else: raise ValueError('Unknown Round 2 draw action.')
    return bind_rosters(s)


def round1_assign_action(s, action):
    s=deepcopy(s);stage=s['round1'];stage.setdefault('assigned',[])
    if action=='spin':
        unassigned=[p for p in IDS if stage['players'][p]['team']=='']
        if not unassigned: return s  # Everyone is assigned; repeat clicks never reroll.
        player=unassigned[0]
        counts={t:sum(stage['players'][p]['team']==t for p in IDS) for t in ['A','B']}
        if counts['A']>=5: team='B'
        elif counts['B']>=5: team='A'
        else: team='A' if secrets.randbelow(2)==0 else 'B'
        stage['players'][player]['team']=team
        stage['assigned'].append(player)
    elif action=='reset':
        for p in stage['assigned']: stage['players'][p]['team']=''
        stage['assigned']=[]
    else: raise ValueError('Unknown Round 1 assignment action.')
    return s
