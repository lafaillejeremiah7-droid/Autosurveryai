#!/usr/bin/env python3
"""Run: python app.py. Opens the local dashboard in your browser."""
import argparse, csv, io, json, os, secrets, threading, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from datetime import datetime, timezone
from engine import new_state, validate, evaluate, bind_rosters, round2_draw_action, round1_lineups, round1_lineup_action, has_inputs, validate_goal_changes

ROOT=Path(__file__).resolve().parent
MAX_BODY=2_000_000

class Store:
    def __init__(self,path):
        self.path=Path(path); self.lock=threading.Lock(); self.revision=0
        exists=self.path.exists()
        loaded=json.loads(self.path.read_text(encoding='utf-8')) if exists else None
        self.state=validate(loaded) if exists else new_state()
        # Persist initial/migrated draws too; restarting before the first edit
        # must not silently reshuffle the teams that were already displayed.
        round1_lineups(self.state)
        if loaded!=self.state or (self.state['settings']['start_at'] and not self.state['settings']['disaster_started_at']):self.save(self.state)
        self.revision=0
    def payload(self): return {'state':self.state,'view':evaluate(self.state),'revision':self.revision}
    def save(self,state,allow_draw=False,restore=False):
        state=validate(state)
        settings=state['settings'];previous_settings=self.state['settings']
        if not settings['start_at']:
            settings['disaster_started_at']=''
        elif restore and settings['disaster_started_at']:
            pass  # Backups and Undo carry their original countdown window.
        elif settings['start_at']!=previous_settings['start_at'] or not previous_settings.get('disaster_started_at'):
            settings['disaster_started_at']=datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
        else:
            settings['disaster_started_at']=previous_settings['disaster_started_at']
        round1_lineups(state)  # Keep (or generate once) the cosmetic Face Your Weakness splits so reloads/backups stay stable.
        previous=self.state['round2']['draw'];incoming=state['round2']['draw']
        reset=not incoming['order'] and not state['round2']['roster'] and not has_inputs(state['round2']) and not has_inputs(state['final'])
        if not allow_draw and incoming!=previous and not reset:
            raise ValueError('Saved Round 2 lineups are protected. Use the Reshuffle teams button before entering scores, or restore a backup.')
        state=bind_rosters(state)
        validate_goal_changes(state,None if restore else self.state)
        self.path.parent.mkdir(parents=True,exist_ok=True)
        temp=self.path.with_suffix('.tmp')
        with temp.open('w',encoding='utf-8') as f:
            json.dump(state,f,ensure_ascii=False,indent=2); f.flush();os.fsync(f.fileno())
        os.replace(temp,self.path);self.state=state;self.revision+=1

def make_server(store,port=8765):
    token=secrets.token_urlsafe(32)
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args): pass
        def send(self,status,data,ctype='application/json',filename=None):
            if not isinstance(data,bytes): data=json.dumps(data,ensure_ascii=False).encode()
            self.send_response(status);self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(data)))
            self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
            if filename:self.send_header('Content-Disposition',f'attachment; filename="{filename}"')
            self.end_headers();self.wfile.write(data)
        def do_GET(self):
            route=urlsplit(self.path).path
            with store.lock:
                if route=='/api/state':return self.send(200,{**store.payload(),'token':token})
                if route=='/api/backup':return self.send(200,store.state,filename='brawl-hockey-backup.json')
                if route=='/api/standings.csv':
                    view=evaluate(store.state);r1={r['id']:r for r in view['round1']['rows']};r2={r['id']:r for r in view['round2']['rows']};fin={r['id']:r for r in view['final']['rows']}
                    out=io.StringIO();writer=csv.writer(out);writer.writerow(['Player','Face Your Weakness','Abandon Your Comfort','Prove Your Resolve rank','Total points','Prize','Final status'])
                    for p,name in store.state['names'].items():
                        r=fin.get(p,{})
                        safe="'"+name if name.startswith(('=','+','-','@','\t','\r')) else name
                        writer.writerow([safe,r1.get(p,{}).get('status',''),r2.get(p,{}).get('status',''),r.get('rank',''),r.get('total',''),r.get('prize',''),r.get('status','')])
                    return self.send(200,out.getvalue().encode('utf-8-sig'),'text/csv; charset=utf-8','brawl-hockey-standings.csv')
            files={'/monuments.js':('monuments.js','text/javascript; charset=utf-8'),'/':('index.html','text/html; charset=utf-8'),'/app.js':('app.js','text/javascript; charset=utf-8'),'/style.css':('style.css','text/css; charset=utf-8'),'/city.js':('city.js','text/javascript; charset=utf-8'),'/city-timeline.js':('city-timeline.js','text/javascript; charset=utf-8'),'/city.css':('city.css','text/css; charset=utf-8')}
            if route in files:
                name,kind=files[route];return self.send(200,(ROOT/'static'/name).read_bytes(),kind)
            self.send(404,{'error':'Not found'})
        def do_PUT(self):
            if self.path not in ['/api/state','/api/round2-draw','/api/round1-lineup']:return self.send(404,{'error':'Not found'})
            if self.headers.get('X-Session-Token')!=token:return self.send(403,{'error':'Reload the dashboard before saving.'})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=MAX_BODY:raise ValueError('Backup is empty or too large.')
                data=json.loads(self.rfile.read(length))
                if not isinstance(data,dict):raise ValueError('Expected a tournament request object.')
                with store.lock:
                    if data.get('revision')!=store.revision:return self.send(409,{'error':'Another tab changed this tournament. Reload before editing.'})
                    if self.path=='/api/round2-draw':
                        store.save(round2_draw_action(store.state,data['action'],data.get('game')),allow_draw=True)
                    elif self.path=='/api/round1-lineup':
                        store.save(round1_lineup_action(store.state,data['action'],data.get('game')))
                    else: store.save(data['state'],allow_draw=data.get('restore') is True,restore=data.get('restore') is True)
                    return self.send(200,store.payload())
            except (ValueError,KeyError,TypeError) as e:self.send(400,{'error':str(e)})
            except OSError:self.send(500,{'error':'Could not save the tournament file. Check folder permissions and free space.'})
    return ThreadingHTTPServer(('127.0.0.1',port),Handler)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description='Brawl Hockey tournament dashboard')
    parser.add_argument('--port',type=int,default=8765);parser.add_argument('--data',default=str(ROOT/'tournament.json'));parser.add_argument('--no-browser',action='store_true')
    args=parser.parse_args()
    try:server=make_server(Store(args.data),args.port)
    except (OSError,ValueError) as e:raise SystemExit(f'Cannot start: {e}')
    url=f'http://127.0.0.1:{server.server_port}'
    print(f'Brawl Hockey dashboard: {url}\nProgress saves to {args.data}\nPress Ctrl+C to stop.',flush=True)
    if not args.no_browser:webbrowser.open(url)
    try:server.serve_forever()
    except KeyboardInterrupt:print('\nDashboard stopped. Progress is saved.')
    finally:server.server_close()
