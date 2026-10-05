#!/usr/bin/env python3
"""Run: python app.py. Opens the local dashboard in your browser."""
import argparse, csv, io, json, os, secrets, threading, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from engine import new_state, validate, evaluate, bind_rosters

ROOT=Path(__file__).resolve().parent
MAX_BODY=2_000_000

class Store:
    def __init__(self,path):
        self.path=Path(path); self.lock=threading.Lock(); self.revision=0
        self.state=validate(json.loads(self.path.read_text())) if self.path.exists() else new_state()
    def payload(self): return {'state':self.state,'view':evaluate(self.state),'revision':self.revision}
    def save(self,state):
        state=bind_rosters(validate(state)); self.path.parent.mkdir(parents=True,exist_ok=True)
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
                    out=io.StringIO();writer=csv.writer(out);writer.writerow(['Player','Round 1','Round 2','Final rank','Total points','Prize','Final status'])
                    for p,name in store.state['names'].items():
                        r=fin.get(p,{})
                        safe="'"+name if name.startswith(('=','+','-','@','\t','\r')) else name
                        writer.writerow([safe,r1.get(p,{}).get('status',''),r2.get(p,{}).get('status',''),r.get('rank',''),r.get('total',''),r.get('prize',''),r.get('status','')])
                    return self.send(200,out.getvalue().encode('utf-8-sig'),'text/csv; charset=utf-8','brawl-hockey-standings.csv')
            files={'/':('index.html','text/html; charset=utf-8'),'/app.js':('app.js','text/javascript; charset=utf-8'),'/style.css':('style.css','text/css; charset=utf-8')}
            if route in files:
                name,kind=files[route];return self.send(200,(ROOT/'static'/name).read_bytes(),kind)
            self.send(404,{'error':'Not found'})
        def do_PUT(self):
            if self.path!='/api/state':return self.send(404,{'error':'Not found'})
            if self.headers.get('X-Session-Token')!=token:return self.send(403,{'error':'Reload the dashboard before saving.'})
            try:
                length=int(self.headers.get('Content-Length','0'))
                if not 0<length<=MAX_BODY:raise ValueError('Backup is empty or too large.')
                data=json.loads(self.rfile.read(length))
                with store.lock:
                    if data.get('revision')!=store.revision:return self.send(409,{'error':'Another tab changed this tournament. Reload before editing.'})
                    store.save(data['state']);return self.send(200,store.payload())
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
