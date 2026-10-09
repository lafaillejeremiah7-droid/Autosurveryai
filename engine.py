"""Tournament rules. No third-party dependencies."""
from copy import deepcopy
from decimal import Decimal
from fractions import Fraction
from itertools import groupby, combinations
import math
import secrets
from datetime import datetime, timezone

TIE = 'TIE - EXTRA GAMES NEEDED'
IDS = [f'p{i+1}' for i in range(10)]
TEAM_GOAL_LIMIT = 3
FINAL_GAMES = 8
ROUND2_GAMES = 5
WINNER_PRIZE = 30
WINNER_TAKE_ALL_PRIZES = [30, 0, 0]

def match_goals(stage, teams, game):
    return {t:sum(stage['players'][p]['goals'][game] or 0 for p in teams[t]) for t in ['A','B']}

def match_goal_error(stage, teams, game):
    totals=match_goals(stage,teams,game)
    for t in ['A','B']:
        if totals[t]>TEAM_GOAL_LIMIT:return f'Team {t} has {totals[t]} goals. A team can score at most 3 goals per match.'
    if totals['A']==TEAM_GOAL_LIMIT and totals['B']==TEAM_GOAL_LIMIT:
        return 'Both teams cannot reach 3 goals. Once one team reaches 3, the other team can score at most 2.'
    return ''

def stage_schedules(s):
    return {'round1':s['round1'].get('lineups',[]),
            'round2':round2_schedule(s['round2']['draw']),
            'final':final_schedule(s['final']['roster'])}

def validate_goal_changes(s, previous=None):
    """Enforce goal limits on writes, retaining old scores for manual repair.

    Loading an old save never discards scores. An already-invalid match may be
    left untouched or have scores lowered/cleared, but cannot gain more goals.
    Backups/new states without a previous record must satisfy every limit.
    """
    schedules=stage_schedules(s);old_schedules=stage_schedules(previous) if previous else {}
    labels={'round1':'Know Thy Nature','round2':'Adapt or Wither','final':'The Last Bloom'}
    for key in labels:
        stage=s[key];old=previous[key] if previous else None
        for g in range({'round1':5,'round2':5,'final':FINAL_GAMES}[key]):
            values={p:stage['players'][p]['goals'][g] for p in IDS}
            teams=schedules[key][g] if g<len(schedules[key]) else {'A':[],'B':[]}
            issue=match_goal_error(stage,teams,g)
            if not issue and any(v is not None and v>3 for v in values.values()):issue='A player cannot score more than the team limit of 3 goals per match.'
            if not issue:continue
            prior_teams=old_schedules[key][g] if previous and g<len(old_schedules[key]) else {'A':[],'B':[]}
            reducing=old and teams==prior_teams and all((v or 0)<=(old['players'][p]['goals'][g] or 0) for p,v in values.items())
            if not reducing:raise ValueError(f'{labels[key]} Game {g+1}: {issue}')
        for i,extra in enumerate(stage['extras']):
            for p,value in extra.items():
                v=value['goals'] if key=='final' else value
                if v is None or v<=3:continue
                old_value=old['extras'][i][p] if old and i<len(old['extras']) else None
                before=old_value.get('goals') if key=='final' and isinstance(old_value,dict) else old_value
                if before is None or v>before:raise ValueError(f'{labels[key]} Extra game {i+1}: a player can score at most 3 goals.')

def extra_goal_issues(stage, final=False):
    return [f'Extra game {i+1}: correct goal entries above 3.' for i,e in enumerate(stage['extras'])
            if any((v.get('goals') if final else v) is not None and (v.get('goals') if final else v)>3 for v in e.values())]

def blank_draw():
    return {'order':[], 'lineups':[], 'revealed':0, 'completed':0, 'mode':'random'}

def blank_round(games=5, is_round2=False):
    return {'players': {p: {'goals': [None]*games} for p in IDS}, 'extras': [], 'roster': [], **({'draw':blank_draw()} if is_round2 else {'lineups':[]})}

def new_state():
    return {'version': 6, 'wheel': {'text': '', 'remove_winner': False}, 'names': {p: '' for p in IDS},
            'settings': {'win_points': 1, 'goal_points': 1.5, 'multiplier': 2, 'prizes': WINNER_TAKE_ALL_PRIZES.copy(), 'start_at': '', 'disaster_started_at': ''},
            'round1': blank_round(), 'round2': blank_round(5, is_round2=True),
            'final': {'players': {p: {'goals': [None]*FINAL_GAMES, 'results': ['']*FINAL_GAMES} for p in IDS}, 'extras': [], 'roster': []}}

def final_schedule(roster):
    """One representative of each unordered 3v3 partition of six players."""
    if len(roster) != 6: return []
    return [{'game': i+1, 'A': [roster[0], *pair],
             'B': [p for p in roster if p not in (roster[0], *pair)]}
            for i, pair in enumerate(list(combinations(roster[1:], 2))[:FINAL_GAMES])]

def _round2_valid_lineups(lineups,order):
    if not isinstance(lineups,list) or len(lineups)!=ROUND2_GAMES or len(order)!=8:return False
    for m in lineups:
        if not isinstance(m,dict) or set(m)!={'A','B'}:return False
        a,b=m['A'],m['B']
        if not isinstance(a,list) or not isinstance(b,list) or len(a)!=4 or len(b)!=4:return False
        if len(set(a+b))!=8 or set(a+b)!=set(order):return False
    return True

def _round2_candidates(order):
    return [{'A':list(a),'B':[p for p in order if p not in a]} for a in combinations(order,4)]

def _round2_balance_cost(lineups,order):
    """Penalize repeat teammates, unbalanced A/B placements and duplicate matchups."""
    score=0;n=len(lineups)
    for p in order:
        as_a=sum(p in m['A'] for m in lineups)
        score+=4*(2*as_a-n)**2
    seen=set()
    for m in lineups:
        pair=frozenset((frozenset(m['A']),frozenset(m['B'])))
        if pair in seen:score+=160
        seen.add(pair)
    for i,p in enumerate(order):
        for q in order[i+1:]:
            together=sum((p in m['A'])==(q in m['A']) for m in lineups)
            score+=(7*together-3*n)**2
            if n==ROUND2_GAMES:
                score+=120*(max(0,together-3)**2+max(0,1-together)**2)
    return score

def _round2_balanced_lineups(order,locked=None):
    """Randomly optimize 5 different 4v4 matchups without touching locked games."""
    if len(order)!=8:return []
    locked=locked or {}
    rng=secrets.SystemRandom()
    candidates=_round2_candidates(order)
    best=None;best_cost=None
    for _attempt in range(3):
        choices=[deepcopy(locked[i]) if i in locked else deepcopy(rng.choice(candidates))
                 for i in range(ROUND2_GAMES)]
        for _pass in range(3):
            for i in range(ROUND2_GAMES):
                if i in locked:continue
                rng.shuffle(candidates)
                occupied={frozenset((frozenset(m['A']),frozenset(m['B'])))
                          for j,m in enumerate(choices) if j!=i}
                options=[m for m in candidates
                         if frozenset((frozenset(m['A']),frozenset(m['B']))) not in occupied]
                costs=[_round2_balance_cost(choices[:i]+[candidate]+choices[i+1:],order)
                       for candidate in options]
                choices[i]=deepcopy(options[costs.index(min(costs))])
        cost=_round2_balance_cost(choices,order)
        if best_cost is None or cost<best_cost:best=choices;best_cost=cost
    return best

def round2_schedule(draw):
    """Use saved per-game 4v4 teams; a bare roster is legacy-compatible."""
    if isinstance(draw,dict):
        order=draw.get('order',[])
        lineups=draw.get('lineups',[])
        if not _round2_valid_lineups(lineups,order):return []
        return [{'game':i+1,'A':list(m['A']),'B':list(m['B'])} for i,m in enumerate(lineups)]
    if len(draw)!=8:return []
    return [{'game':i+1,'A':list(draw[:4]),'B':list(draw[4:])} for i in range(ROUND2_GAMES)]

def has_inputs(stage):
    return bool(stage['extras']) or any(d.get('team') or any(v is not None for v in d['goals']) or any(d.get('results',[])) for d in stage['players'].values())

def _normalize_round1(s):
    """Strip the retired fixed-team fields from a round1 stage in place.

    Old v4 saves carried a per-player 'team' and a round1 'assigned' list from
    the retired wheel-assignment model. Teams are now cosmetic per-game splits,
    so drop both (preserving goals) and default 'lineups' (regenerated lazily).
    """
    r1=s.get('round1')
    if isinstance(r1,dict):
        r1.pop('assigned',None)
        r1.setdefault('lineups',[])
        for d in r1.get('players',{}).values():
            if isinstance(d,dict): d.pop('team',None)
    return s

def _normalize_game_lengths(s):
    """Repair saves made by versions with different match counts.

    Older builds used a five-game Round 2 and a ten-game Final. Those saves
    should still open so the host can correct or clear them instead of the
    server refusing to start. Existing entries are kept where they fit; new
    slots are blank and therefore cannot count as completed games.
    """
    targets={'round1':5, 'round2':5, 'final':FINAL_GAMES}
    for key,target in targets.items():
        stage=s.get(key)
        if not isinstance(stage,dict) or not isinstance(stage.get('players'),dict):
            continue
        for player_id,d in stage['players'].items():
            if not isinstance(d,dict):
                continue
            goals=d.get('goals',[])
            if not isinstance(goals,list): raise ValueError('Invalid saved goals: expected a list.')
            if len(goals)>target or (key=='final' and isinstance(d.get('results'),list) and len(d['results'])>target):
                archive=s.setdefault('legacy_game_lengths',{}).setdefault(key,{})
                archive.setdefault(player_id,deepcopy(d))
            d['goals']=(goals[:target] + [None]*target)[:target]
            if key=='final':
                results=d.get('results',[])
                if not isinstance(results,list): raise ValueError('Invalid saved results: expected a list.')
                d['results']=(results[:target] + ['']*target)[:target]
    return s

def migrate(s):
    version=s.get('version')
    if version==5:
        # Previously completed or scored games retain their old fixed lineups.
        # Unplayed games receive new balanced 4v4 teams without losing scores.
        s=deepcopy(s);draw=s['round2']['draw'];order=draw.get('order',[])
        if order:
            old={'A':list(order[:4]),'B':list(order[4:])}
            locked={i:old for i in range(ROUND2_GAMES)
                    if i<draw['completed'] or any(s['round2']['players'][p]['goals'][i] is not None for p in IDS)}
            draw['lineups']=_round2_balanced_lineups(order,locked)
        else:draw['lineups']=[]
        s['version']=6
        return _normalize_game_lengths(_normalize_round1(s))
    if version in (3,4):
        # The old 3v3 sit-out rotation cannot be reinterpreted as fixed 4v4.
        # Archive the full previous rounds, then require fresh Round 2 scoring.
        s=deepcopy(s)
        old=s['round2']
        if has_inputs(old) or has_inputs(s['final']) or old.get('draw',{}).get('order'):
            s['legacy_round2_rotation']={'round2':deepcopy(old),'final':deepcopy(s['final']),
                                          'settings':deepcopy(s['settings'])}
        s['round2']=blank_round(ROUND2_GAMES,is_round2=True)
        s['final']=new_state()['final']
        s['version']=6
        return _normalize_game_lengths(_normalize_round1(s))
    if version not in (1,2):
        return _normalize_game_lengths(_normalize_round1(deepcopy(s)))
    s=deepcopy(s)
    if version==1:
        old=s['final']
        if has_inputs(old):
            s['legacy_final']={'settings':deepcopy(s['settings']), 'final':deepcopy(old)}
        s['final']=new_state()['final']
        s['settings']['win_points']=1
        s['settings']['goal_points']=1.5
    if has_inputs(s['round2']) or has_inputs(s['final']):
        s['legacy_round2']={'round2':deepcopy(s['round2']), 'final':deepcopy(s['final']),
                            'settings':deepcopy(s['settings'])}
    s['round2']=blank_round(ROUND2_GAMES,is_round2=True)
    s['final']=new_state()['final']
    s['version']=6
    return _normalize_game_lengths(_normalize_round1(s))

def numeric(v, nullable=False, integer=False):
    if v is None and nullable: return
    if isinstance(v,bool) or not isinstance(v,(int,float)) or not math.isfinite(v) or not 0 <= v <= 100000:
        raise ValueError('Enter a number from 0 to 100,000.')
    if integer and v != int(v): raise ValueError('Goals must be whole numbers.')

def validate(s):
    try:
        s=migrate(s)
        s.setdefault('wheel', {'text': '', 'remove_winner': False})
        s.setdefault('settings', {}).setdefault('start_at', '')
        s['settings'].setdefault('disaster_started_at', '')
        if not isinstance(s['wheel'],dict) or not isinstance(s['wheel'].get('text'),str) or not isinstance(s['wheel'].get('remove_winner'),bool):
            raise ValueError('Invalid wheel list or removal setting.')
        if s['version'] != 6 or set(s['names']) != set(IDS): raise ValueError('Invalid tournament backup.')
        for name in s['names'].values():
            if not isinstance(name,str) or len(name)>40: raise ValueError('Names must be 40 characters or fewer.')
        for k in ['win_points','goal_points','multiplier']: numeric(s['settings'][k])
        for key in ['start_at','disaster_started_at']:
            raw=s['settings'][key]
            if not isinstance(raw,str) or len(raw)>40: raise ValueError('Invalid countdown time.')
            if raw:
                try:
                    parsed=datetime.fromisoformat(raw.replace('Z','+00:00'))
                    # Older backups could contain timezone-free ISO times. Interpret those
                    # consistently as UTC; new browser inputs always send an explicit zone.
                    if parsed.tzinfo is None: parsed=parsed.replace(tzinfo=timezone.utc)
                    s['settings'][key]=parsed.astimezone(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
                except (ValueError,OverflowError): raise ValueError('Invalid countdown time.')
        # Existing saves/backups are automatically brought into the fixed
        # $30 winner-take-all prize structure; clients cannot change the payout.
        s['settings']['prizes'] = WINNER_TAKE_ALL_PRIZES.copy()
        s['round1'].setdefault('lineups',[])
        lineups=s['round1']['lineups']
        if not isinstance(lineups,list) or (lineups and not _valid_lineups(lineups)):
            raise ValueError('Invalid Know Thy Nature game teams.')
        for stage in ['round1','round2','final']:
            a=s[stage]
            if set(a['players'])!=set(IDS) or len(a['extras'])>50: raise ValueError('Invalid player records or too many extra games.')
            if not isinstance(a['roster'],list) or len(a['roster'])!=len(set(a['roster'])) or any(p not in IDS for p in a['roster']):
                raise ValueError('Invalid roster.')
            if stage=='round2':
                draw=a['draw'];order=draw['order']
                if not isinstance(order,list) or (order and (len(order)!=8 or len(set(order))!=8 or set(order)!=set(a['roster']))):
                    raise ValueError('Invalid saved Round 2 draw order.')
                if any(type(draw[k]) is not int or not 0<=draw[k]<=ROUND2_GAMES for k in ['revealed','completed']):
                    raise ValueError('Invalid Round 2 match progress.')
                if draw['mode'] not in ['random','preserved'] or draw['completed']>draw['revealed']:
                    raise ValueError('Invalid Round 2 draw progress.')
                if not order and (draw['revealed'] or draw['completed']): raise ValueError('Draw the first match before recording progress.')
                if order and draw['revealed']<1: raise ValueError('A saved draw must reveal its first match.')
                if (order and not _round2_valid_lineups(draw.get('lineups'),order)) or (not order and draw.get('lineups')!=[]):
                    raise ValueError('Round 2 saved teams must be five complete 4v4 splits.')
            for d in a['players'].values():
                if len(d['goals'])!={'round1':5,'round2':5,'final':FINAL_GAMES}[stage]: raise ValueError('Know Thy Nature needs 5 games, Adapt or Wither 5 games, and The Last Bloom 8 games.')
                for v in d['goals']: numeric(v,True,True)
                if stage=='final':
                    if len(d['results'])!=FINAL_GAMES or any(v not in ['','W','L'] for v in d['results']): raise ValueError('Results must be W or L.')
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

def rank_bubble(ids, reg_scores, extras, cut, straddle_only, resolve):
    """Rank players, folding extra games only for the tied cut-line bubble.

    reg_scores maps id -> regulation primary score. Players are first grouped by
    EXACT regulation score (descending). A group is the 'bubble' when its rank
    range crosses the cut: rank r with r<=cut<r+size-1 (straddle_only=True), or,
    for the podium final, any multi-member group with rank<=cut
    (straddle_only=False). Safe players outside the bubble keep regulation
    ranks/status. For the bubble, resolve(group, start_rank) folds extras into an
    effective score and re-ranks ONLY within [start_rank, start_rank+size-1].

    Returns {id: {'rank','status','bubble'}}; bubble members also carry whatever
    extra keys resolve() set (e.g. folded total/played/average).
    """
    order=sorted(ids,key=lambda p:reg_scores[p],reverse=True)
    groups=[list(g) for _,g in groupby(order,key=lambda p:reg_scores[p])]
    out={}; rank=1
    for group in groups:
        size=len(group)
        is_bubble=size>1 and (rank<=cut<rank+size-1 if straddle_only else rank<=cut)
        if is_bubble:
            out.update(resolve(group, rank))
        else:
            for p in group:
                out[p]={'rank':rank,'status':'ADVANCE' if rank<=cut else 'CUT','bubble':False}
        rank+=size
    return out

def resolve_average_bubble(group, extras, reg_total, reg_played, rowmap, start_rank, cut):
    """Fold scores live, but settle a tie only after the whole group is scored."""
    totals=dict(reg_total);played=dict(reg_played)
    def fold(p,index):
        totals[p]+=extras[index][p];played[p]+=1
        avg=Fraction(totals[p],played[p])
        rowmap[p].update(goals=totals[p],played=played[p],average=float(avg))
        return avg
    return resolve_extra_bubble(group,extras,start_rank,cut,True,fold)

def resolve_extra_bubble(group, extras, start_rank, cut, straddle_only, fold):
    """Consume extra games in order, freezing places as subgroups resolve.

    A partial game's numbers can update live, but its entire unresolved group
    keeps TIE status. Later games cannot bypass a missing score, or displace a
    player whose place was already settled by an earlier extra game.
    """
    out={}
    def visit(members,rank,index):
        tied=len(members)>1 and (rank<=cut<rank+len(members)-1 if straddle_only else rank<=cut)
        if tied and index<len(extras):
            scores={p:fold(p,index) for p in members if extras[index].get(p) is not None}
            if len(scores)==len(members):
                for sub in order_groups(members,scores,[]):
                    visit(sub,rank,index+1);rank+=len(sub)
                return
        for p in members:
            out[p]={'rank':rank,'status':TIE if tied else ('ADVANCE' if rank<=cut else 'CUT'),'bubble':True}
    visit(group,start_rank,0)
    return out

def round1_view(s, names_ok):
    stage=s['round1'];roster=IDS;cut=8;stale=False
    rows=[]; scores={}; issues=extra_goal_issues(stage)
    for p in roster:
        d=stage['players'][p]; played=sum(v is not None for v in d['goals']); total=sum(v or 0 for v in d['goals'])
        scores[p]=Fraction(total,played) if played else Fraction(0)
        rows.append({'id':p,'name':s['names'][p] or f'Player {IDS.index(p)+1}', 'goals':total,'played':played,
                     'average':float(scores[p]),'rank':None,'status':'PENDING'})
    if not names_ok: issues.append('Enter 10 unique player names in Players & rules.')
    # Read cosmetic per-game splits without mutating s (pure view). Empty => not
    # yet generated: the server calls round1_lineups(s) to persist them.
    lineups=stage.get('lineups') if _valid_lineups(stage.get('lineups')) else []
    games=[]
    for g in range(5):
        split=lineups[g] if lineups else None
        counts={t:sum(stage['players'][p]['goals'][g] is not None for p in split[t]) for t in ['A','B']} if split else {'A':0,'B':0}
        teams=split or {'A':[],'B':[]};score_error=match_goal_error(stage,teams,g)
        ready=bool(lineups) and not score_error and all(stage['players'][p]['goals'][g] is not None for p in roster)
        games.append({'game':g+1,'teams':teams,'counts':counts,'goals':match_goals(stage,teams,g),'score_error':score_error,'ready':ready})
        if score_error:issues.append(f'Game {g+1}: {score_error}')
    if not lineups: issues.append('Generating game teams. Reload Know Thy Nature to shuffle the first split.')
    if not all(g['ready'] for g in games): issues.append('Complete all five games: enter a score for every player each game. Enter 0 for no goals.')
    ready=not issues
    rowmap={r['id']:r for r in rows}
    reg_total={r['id']:r['goals'] for r in rows}; reg_played={r['id']:r['played'] for r in rows}
    extras=stage['extras']
    def resolve_avg(group, start):
        return resolve_average_bubble(group, extras, reg_total, reg_played, rowmap, start, cut)
    if ready:
        for p,info in rank_bubble(roster,scores,extras,cut,True,resolve_avg).items():
            rowmap[p]['rank']=info['rank']; rowmap[p]['status']=info['status']
    else:
        rank=1
        for group in order_groups(roster,scores,extras):
            for p in group: rowmap[p]['rank']=rank; rowmap[p]['status']='PENDING'
            rank+=len(group)
    tied=any(r['status']==TIE for r in rows)
    if tied: issues.append('Tie across 8th and 9th: play extra games for the highlighted players.')
    survivors=[r['id'] for r in rows if r['status']=='ADVANCE'] if ready and not tied else []
    return {'rows':rows,'games':games,'issues':issues,'ready':ready,'complete':ready and not tied,'survivors':survivors,'stale':stale}

def round2_view(s, roster, names_ok, upstream=True):
    stage=s['round2'];draw=stage['draw'];schedule=round2_schedule(draw)
    rows=[];scores={};issues=extra_goal_issues(stage)
    stale=bool(stage['roster'] and stage['roster']!=roster)
    if not upstream: issues.append('Complete Know Thy Nature and resolve its cut ties.')
    if stale: issues.append('The survivor list changed. Reset Adapt or Wither before entering new scores.')
    if not names_ok: issues.append('Enter 10 unique player names in Players & rules.')
    if not draw['order']: issues.append('Draw the 4v4 team rotations to start Adapt or Wither.')
    games=[]
    for match in schedule:
        g=match['game']-1
        counts={t:sum(stage['players'][p]['goals'][g] is not None for p in match[t]) for t in ['A','B']}
        score_error=match_goal_error(stage,match,g)
        games.append({'game':g+1,'counts':counts,'goals':match_goals(stage,match,g),
                      'score_error':score_error,'ready':all(n==4 for n in counts.values()) and not score_error})
        if score_error: issues.append(f'Game {g+1}: {score_error}')
    if upstream and (len(games)!=ROUND2_GAMES or not all(g['ready'] for g in games)):
        issues.append('Complete all five 4v4 games: enter goals for all eight players, including 0 for no goals.')
    for p in roster:
        values=[stage['players'][p]['goals'][i] for i in range(ROUND2_GAMES)]
        played=sum(v is not None for v in values);total=sum(v or 0 for v in values)
        scores[p]=Fraction(total,played) if played else Fraction(0)
        rows.append({'id':p,'name':s['names'][p],'goals':total,'played':played,
                     'average':float(scores[p]),'rank':None,'status':'PENDING'})
    if draw['completed']<ROUND2_GAMES: issues.append('Mark all five matches done after entering eight scores per match.')
    ready=not issues;rowmap={r['id']:r for r in rows}
    reg_total={r['id']:r['goals'] for r in rows}
    reg_played={r['id']:r['played'] for r in rows}
    extras=stage['extras']
    if ready:
        def resolve_avg(group,start):
            return resolve_average_bubble(group,extras,reg_total,reg_played,rowmap,start,6)
        for p,info in rank_bubble(roster,scores,extras,6,True,resolve_avg).items():
            rowmap[p]['rank']=info['rank'];rowmap[p]['status']=info['status']
    else:
        rank=1
        for group in order_groups(roster,scores,extras):
            for p in group: rowmap[p]['rank']=rank;rowmap[p]['status']='PENDING'
            rank+=len(group)
    tied=any(r['status']==TIE for r in rows)
    if tied: issues.append('Tie across 6th and 7th: play extra games for the highlighted players.')
    survivors=[p for p in roster if rowmap[p]['status']=='ADVANCE'] if ready and not tied else []
    rows.sort(key=lambda r:r['rank'])
    return {'rows':rows,'games':games,'schedule':schedule,'draw':deepcopy(draw),'issues':issues,
            'ready':ready,'complete':ready and not tied,'survivors':survivors,'stale':stale}

def evaluate(s):
    n=[s['names'][p].strip().casefold() for p in IDS]; names_ok=all(n) and len(set(n))==10
    r1=round1_view(s,names_ok)
    r2=round2_view(s,r1['survivors'],names_ok,r1['complete'])
    roster=r2['survivors']; stage=s['final']; settings=s['settings']; rows=[]; scores={}; issues=extra_goal_issues(stage,True)
    stale=bool(stage['roster'] and stage['roster']!=roster)
    if not r2['complete']: issues.append('Complete Adapt or Wither and resolve its cut ties.')
    if stale: issues.append('The finalist list changed. Reset the final before entering new scores.')
    for p in roster:
        d=stage['players'][p]; wins=Decimal(0); goals=Decimal(0); game_points=[]
        for g in range(FINAL_GAMES):
            if d['goals'][g] is None and not d['results'][g]: game_points.append(None); continue
            w,h=points(d['goals'][g],d['results'][g],settings,settings['multiplier'] if g<2 else 1)
            wins+=w; goals+=h; game_points.append(float(w+h))
        scores[p]=wins+goals
        rows.append({'id':p,'name':s['names'][p],'win_points':float(wins),'goal_points':float(goals),'total':float(wins+goals),
                     'goals':sum(v or 0 for v in d['goals']),'wins':sum(v=='W' for v in d['results']),
                     'played':sum(d['goals'][g] is not None and bool(d['results'][g]) for g in range(FINAL_GAMES)),
                     'game_points':game_points,'rank':None,'prize':None,'status':'PENDING'})
    schedule=final_schedule(roster)
    games=[]
    for g in range(FINAL_GAMES):
        count=sum(stage['players'][p]['goals'][g] is not None for p in roster)
        w=sum(stage['players'][p]['results'][g]=='W' for p in roster); l=sum(stage['players'][p]['results'][g]=='L' for p in roster)
        teams=schedule[g] if schedule else {'A':[], 'B':[]}
        outcomes=[{stage['players'][p]['results'][g] for p in teams[t]} for t in ['A','B']]
        consistent=outcomes in [[{'W'},{'L'}],[{'L'},{'W'}]]
        score_error=match_goal_error(stage,teams,g)
        games.append({'game':g+1,'scores':count,'wins':w,'losses':l,'teams':teams,'goals':match_goals(stage,teams,g),'score_error':score_error,
                      'ready':count==6 and consistent and not score_error})
        if score_error:issues.append(f'Game {g+1}: {score_error}')
    if roster and not all(g['ready'] for g in games): issues.append('Complete all eight games: six goal scores each, with W for the scheduled winning team and L for its opponents.')
    ready=not issues; extra_scores=[]
    for extra in stage['extras']:
        extra_scores.append({p:sum(points(extra[p]['goals'],extra[p]['result'],settings)) if extra[p]['goals'] is not None and extra[p]['result'] else None for p in roster})
    rowmap={r['id']:r for r in rows}
    if ready:
        def resolve_final(group, start):
            totals={p:scores[p] for p in group}
            win_totals={p:sum((points(stage['players'][p]['goals'][g],stage['players'][p]['results'][g],settings,settings['multiplier'] if g<2 else 1)[0] for g in range(FINAL_GAMES)),Decimal(0)) for p in group}
            goal_totals={p:totals[p]-win_totals[p] for p in group}
            def fold(p,index):
                extra=stage['extras'][index][p];w,h=points(extra['goals'],extra['result'],settings)
                totals[p]+=w+h;win_totals[p]+=w;goal_totals[p]+=h
                row=rowmap[p]
                row.update(total=float(totals[p]),win_points=float(win_totals[p]),goal_points=float(goal_totals[p]))
                row['goals']+=extra['goals'];row['wins']+=extra['result']=='W';row['played']+=1
                return totals[p]
            out=resolve_extra_bubble(group,extra_scores,start,1,False,fold)
            for info in out.values():
                tied=info['status']==TIE;rank=info['rank']
                info['status']=TIE if tied else 'FINAL'
                info['prize']=None if tied else (WINNER_PRIZE if rank==1 else 0)
            return out
        placing=rank_bubble(roster,scores,extra_scores,1,False,resolve_final)
        for p,info in placing.items():
            r=rowmap[p];r['rank']=info['rank']
            if info['bubble']:
                r['status']=info['status']; r['prize']=info['prize']
            else:
                r['status']='FINAL'; r['prize']=WINNER_PRIZE if info['rank']==1 else 0
    else:
        rank=1
        for group in order_groups(roster,scores,extra_scores):
            for p in group:
                r=rowmap[p];r['rank']=rank;r['status']='PENDING';r['prize']=None
            rank+=len(group)
    rows.sort(key=lambda r:r['rank'])
    if any(r['status']==TIE for r in rows): issues.append('First-place tie: play extra games until exactly one champion earns the $30 prize.')
    final={'schedule':schedule,'rows':rows,'games':games,'issues':issues,'ready':ready,'complete':ready and not any(r['status']==TIE for r in rows),'stale':stale}
    return {'round1':r1,'round2':r2,'final':final,'pool':WINNER_PRIZE,
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
        raise ValueError('Complete Know Thy Nature and resolve any changed Round 2 roster first.')
    if action=='start':
        if draw['order']: return s  # Repeat clicks/retries never reroll a saved draw.
        if has_inputs(stage): raise ValueError('Existing scores cannot be assigned to a new draw.')
        order=list(view['round1']['survivors']);secrets.SystemRandom().shuffle(order)
        stage['roster']=list(view['round1']['survivors'])
        stage['draw']={'order':order,'lineups':_round2_balanced_lineups(order),'revealed':1,'completed':0,'mode':'random'}
    elif action=='reroll':
        if not draw['order']: raise ValueError('Start Round 2 first.')
        if type(game) is not int or not 1<=game<=ROUND2_GAMES:
            raise ValueError('Choose a match from 1 to 5.')
        g=game-1
        if g!=draw['completed'] or g>=draw['revealed']:
            raise ValueError('Only the current uncompleted match can be reshuffled.')
        if any(stage['players'][p]['goals'][g] is not None for p in IDS):
            raise ValueError('This game has scores. Clear this game before reshuffling.')
        old=draw['lineups'][g]
        occupied={frozenset((frozenset(m['A']),frozenset(m['B'])))
                  for j,m in enumerate(draw['lineups']) if j!=g}
        alternatives=[m for m in _round2_candidates(draw['order'])
                      if set(m['A'])!=set(old['A']) and set(m['A'])!=set(old['B'])
                      and frozenset((frozenset(m['A']),frozenset(m['B']))) not in occupied]
        rng=secrets.SystemRandom();rng.shuffle(alternatives)
        costs=[_round2_balance_cost(draw['lineups'][:g]+[m]+draw['lineups'][g+1:],draw['order'])
               for m in alternatives]
        draw['lineups'][g]=deepcopy(alternatives[costs.index(min(costs))])
    elif action=='done':
        if not draw['order']: raise ValueError('Draw the 4v4 teams first.')
        if type(game) is not int or game!=draw['completed']+1 or not 1<=game<=ROUND2_GAMES or game>draw['revealed']:
            raise ValueError('Complete the current match in order. This match may already be marked done.')
        if not all(g['ready'] for g in view['round2']['games'][:game]):
            raise ValueError('Enter all eight goal scores, including zeros, before marking the match done.')
        draw['completed']=game;draw['revealed']=max(draw['revealed'],min(game+1,ROUND2_GAMES))
    else: raise ValueError('Unknown Round 2 draw action.')
    return bind_rosters(s)


def _round1_split():
    """One fresh cosmetic 5v5 split of all 10 IDS using cryptographic shuffle."""
    order=list(IDS); secrets.SystemRandom().shuffle(order)
    return {'A':order[:5], 'B':order[5:]}

def _valid_lineups(lineups):
    """True when lineups is a list of exactly 5 valid 5/5 partitions of IDS."""
    if not isinstance(lineups,list) or len(lineups)!=5: return False
    want=set(IDS)
    for e in lineups:
        if not isinstance(e,dict) or set(e)!={'A','B'}: return False
        a=e['A']; b=e['B']
        if not isinstance(a,list) or not isinstance(b,list) or len(a)!=5 or len(b)!=5: return False
        if set(a+b)!=want or len(set(a+b))!=10: return False
    return True

def round1_lineups(s):
    """Return the 5 per-game cosmetic 5v5 splits, generating+storing if absent.

    Teams are cosmetic (ranking is by total goals, not wins), so a fresh random
    partition is drawn for each of the five games with secrets.SystemRandom()
    (mirrors round2_draw_action's shuffle). Idempotent: once five valid splits
    exist they are returned unchanged so reloads/backups stay stable.
    """
    stage=s['round1']
    if not _valid_lineups(stage.get('lineups')):
        stage['lineups']=[_round1_split() for _ in range(5)]
    return stage['lineups']

def round1_lineup_action(s, action, game=None):
    """Optional guarded per-game re-roll of a cosmetic Know Thy Nature split.

    'game' is 1-based (matches the frontend's game numbering). A reroll RAISES
    if any player already has an entered score for that game, so a reroll never
    silently invalidates recorded goals (round2_draw_action guard philosophy).
    Unknown actions raise. Returns a deepcopy.
    """
    s=deepcopy(s);stage=s['round1'];round1_lineups(s)
    if action=='reroll':
        if type(game) is not int or not 1<=game<=5:
            raise ValueError('Choose a game from 1 to 5 to reshuffle.')
        g=game-1
        if any(stage['players'][p]['goals'][g] is not None for p in IDS):
            raise ValueError('That game already has scores. Clear them before reshuffling teams.')
        stage['lineups'][g]=_round1_split()
    else: raise ValueError('Unknown Round 1 lineup action.')
    return s
