"""Regression cases for corrections made after the first full tournament run."""
import csv
import io
import json
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from engine import IDS, TIE, evaluate, validate
from app import Store, make_server
from test_tournament import fixture, cut_tie_state, final_tie_state


class Regressions(unittest.TestCase):
    def test_partial_extra_keeps_each_cut_tied(self):
        for key,first,second in [('round1','p5','p9'),('round2','p4','p8')]:
            with self.subTest(round=key):
                s=cut_tie_state(key)
                e=dict.fromkeys(IDS);e[first]=3;s[key]['extras']=[e]
                v=evaluate(s)[key]
                self.assertFalse(v['complete']);self.assertEqual(v['survivors'],[])
                self.assertEqual({r['id'] for r in v['rows'] if r['status']==TIE},{first,second})
                # A later filled game must not bypass an earlier missing score.
                s[key]['extras'].append({**dict.fromkeys(IDS),first:2,second:0})
                self.assertFalse(evaluate(s)[key]['complete'])
                e[second]=0
                self.assertTrue(evaluate(s)[key]['complete'])

    def test_partial_final_extra_withholds_prizes_and_counts_points(self):
        s=final_tie_state()
        e={p:{'goals':None,'result':''} for p in IDS}
        e['p1']={'goals':2,'result':'W'};s['final']['extras']=[e]
        v=evaluate(s)['final'];rows={r['id']:r for r in v['rows']}
        self.assertFalse(v['complete'])
        for p in ['p1','p2']:
            self.assertEqual(rows[p]['status'],TIE);self.assertIsNone(rows[p]['prize'])
        p1=rows['p1']
        self.assertEqual((p1['goals'],p1['played'],p1['wins']),(10,9,9))
        self.assertEqual(p1['total'],p1['win_points']+p1['goal_points'])
        e['p2']={'goals':0,'result':''}
        self.assertFalse(evaluate(s)['final']['complete'])
        e['p2']['result']='L'
        self.assertTrue(evaluate(s)['final']['complete'])
        self.assertEqual(evaluate(s)['awarded'],30)

    def test_later_extra_does_not_displace_a_settled_cut_player(self):
        s=cut_tie_state('round1');s['round1']['players']['p8']['goals'][2]=1
        s['round1']['extras']=[{**dict.fromkeys(IDS),'p8':1,'p9':0,'p5':0},
                               {**dict.fromkeys(IDS),'p9':3,'p5':0}]
        v=evaluate(s)['round1'];rows={r['id']:r for r in v['rows']}
        self.assertTrue(v['complete'])
        self.assertEqual((rows['p8']['rank'],rows['p8']['played']),(7,6))
        self.assertEqual((rows['p9']['rank'],rows['p9']['played']),(8,7))
        self.assertEqual(rows['p5']['status'],'CUT')

    def test_later_final_extra_keeps_first_place_and_components(self):
        s=final_tie_state(3)
        def extra(scores):return {p:{'goals':scores.get(p),'result':'L' if p in scores else ''} for p in IDS}
        s['final']['extras']=[extra({'p1':1,'p2':0,'p3':0}),extra({'p2':3,'p3':1})]
        v=evaluate(s)['final'];rows={r['id']:r for r in v['rows']}
        self.assertTrue(v['complete'])
        self.assertEqual((rows['p1']['rank'],rows['p1']['prize'],rows['p1']['played']),(1,30,9))
        # Once the sole champion is settled, later non-title extras do not count.
        self.assertEqual((rows['p2']['rank'],rows['p2']['prize'],rows['p2']['played']),(2,0,9))
        for row in v['rows']:self.assertEqual(row['total'],row['win_points']+row['goal_points'])

    def test_startup_persists_new_and_migrated_lineups(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'state.json';first=Store(path)
            self.assertTrue(path.exists());self.assertEqual(first.revision,0)
            self.assertEqual(Store(path).state,first.state)
            s=fixture();s['round1'].pop('lineups');s['names']['p1']='Jay 🏒'
            path.write_text(json.dumps(s,ensure_ascii=False),encoding='utf-8')
            loaded=Store(path)
            self.assertEqual(Store(path).state,loaded.state)
            self.assertEqual(loaded.state['names']['p1'],'Jay 🏒')
            self.assertEqual(validate(json.loads(path.read_text(encoding='utf-8'))),loaded.state)

    def test_old_match_counts_preserve_overflow_scores(self):
        s=fixture()
        for p in IDS:
            s['final']['players'][p]['goals'] += [2,1]
            s['final']['players'][p]['results'] += ['W','L']
            s['round2']['players'][p]['goals']=s['round2']['players'][p]['goals'][:5]
        round2_goals=s['round2']['players']['p1']['goals'][:]
        migrated=validate(s)
        self.assertEqual(len(migrated['final']['players']['p1']['goals']),8)
        archived=migrated['legacy_game_lengths']['final']['p1']
        self.assertEqual(archived['goals'][-2:],[2,1])
        self.assertEqual(archived['results'][-2:],['W','L'])
        self.assertEqual(len(migrated['round2']['players']['p1']['goals']),5)
        self.assertEqual(migrated['round2']['players']['p1']['goals'],round2_goals)
        self.assertEqual(validate(migrated),migrated)

    def test_malformed_goals_are_not_silently_cleared(self):
        for value in [None,{},'not scores']:
            s=fixture();s['round1']['players']['p1']['goals']=value
            with self.assertRaises(ValueError):validate(s)

    def test_v3_short_match_count_migrates_without_index_error(self):
        s=fixture();s['version']=3;s['round2'].pop('draw')
        for p in IDS:s['round2']['players'][p]['goals']=s['round2']['players'][p]['goals'][:5]
        migrated=validate(s)
        self.assertEqual(migrated['version'],6)
        self.assertEqual(len(migrated['round2']['players']['p1']['goals']),5)


    def test_static_routes_and_removed_svg(self):
        with tempfile.TemporaryDirectory() as tmp:
            server=make_server(Store(Path(tmp)/'state.json'),0)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            url=f'http://127.0.0.1:{server.server_port}'
            try:
                for route in ['/','/app.js','/city.js','/city.css','/style.css','/city-timeline.js','/monuments.js','/divine3d.js','/divine-preview']:
                    with self.subTest(route=route),urlopen(url+route) as response:
                        self.assertEqual(response.status,200)
                # The real HTML must load the WebGL script through the server;
                # a missing route silently falls back to the flat SVG cutscene.
                with urlopen(url+'/') as response:
                    page=response.read().decode('utf-8')
                self.assertIn('<script src="/divine3d.js"></script>',page)
                with urlopen(url+'/divine3d.js') as response:
                    renderer=response.read().decode('utf-8')
                self.assertIn('window.Divine3D=',renderer)
                self.assertIn('PORTAL_PLANE=44',renderer)
                with urlopen(url+'/divine-preview') as response:
                    standalone=response.read().decode('utf-8')
                self.assertIn('window.Divine3D=',standalone)
                self.assertIn('Replay actual 3D scene',standalone)
                with self.assertRaises(HTTPError) as caught:urlopen(url+'/tower-strike.svg')
                self.assertEqual(caught.exception.code,404);caught.exception.close()
            finally:
                server.shutdown();server.server_close()

    def test_standings_csv_guards_leading_whitespace_formula_injection(self):
        # A spreadsheet strips leading whitespace/newlines before evaluating a
        # cell, so a name whose first non-whitespace char is a formula operator
        # must be emitted with a protective leading single quote even when the
        # raw first character is a space, tab, carriage return, or newline.
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'state.json';store=Store(path)
            server=make_server(store,0)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            url=f'http://127.0.0.1:{server.server_port}'
            try:
                state=fixture()
                injected={'p1':' =1+1','p2':'\n=cmd()','p3':'=HYPERLINK(1)','p4':'\t+2','p5':'\r-3','p6':'@SUM(1)','p7':'Player 7'}
                state['names'].update(injected)
                info=json.load(urlopen(url+'/api/state'));token=info['token']
                body=json.dumps({'revision':info['revision'],'state':state,'restore':True}).encode()
                headers={'Content-Type':'application/json','X-Session-Token':token}
                json.load(urlopen(Request(url+'/api/state',data=body,headers=headers,method='PUT')))
                csv_text=urlopen(url+'/api/standings.csv').read().decode('utf-8-sig')
                rows=list(csv.reader(io.StringIO(csv_text)))
                cells={row[0] for row in rows[1:]}
                for pid,name in injected.items():
                    if name.lstrip() and name.lstrip()[0] in '=+-@|\t\r\n':
                        with self.subTest(name=repr(name)):
                            self.assertIn("'"+name,cells)
                            self.assertNotIn(name,cells)
                # An ordinary name must not be over-escaped with a leading quote.
                self.assertIn('Player 7',cells);self.assertNotIn("'Player 7",cells)
            finally:
                server.shutdown();server.server_close();thread.join()

if __name__=='__main__':unittest.main()
