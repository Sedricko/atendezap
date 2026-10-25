# Revisão AUTOMÁTICA do código do AtendeZap (sintaxe, padrões de risco, manifesto). Uso, na pasta do projeto:  python3 tools/auditoria.py
# Para ver código morto, textos desatualizados e dados pessoais nos arquivos de diagnóstico, veja docs/AUDITORIA.md (checagens feitas à mão na v1.47).
import os,re,json,subprocess,ast,collections
R=lambda p: open(p,encoding='utf-8',errors='replace').read()
js=['background.js','content/main.js','content/ia.js','content/util.js','content/waimport.js','page/bridge.js','page/pre.js','tools/gerar-wrapalvos.js']+[f'lib/{f}' for f in sorted(os.listdir('lib')) if f.endswith('.js')]
print('== 1) SINTAXE ==')
bad=[]
for f in js+['planilha/AdminControle.gs','planilha/AtendeZap.gs','test/util.test.js','test/admin.test.js','test/planilha.test.js']:
    src=f; tmp=None
    if f.endswith('.gs'): tmp='/tmp/_aud.js'; open(tmp,'w',encoding='utf-8').write(R(f)); src=tmp
    r=subprocess.run(['node','--check',src],capture_output=True,text=True)
    if r.returncode: bad.append((f,r.stderr[:160]))
for f in ['test/smoke.py','tools/mapa_main.py','tools/teste/mk_reduzido.py']:
    try: ast.parse(R(f))
    except Exception as e: bad.append((f,str(e)[:100]))
for f in ['manifest.json','test/funcoes_main.json']:
    try: json.loads(R(f))
    except Exception as e: bad.append((f,str(e)[:100]))
print('  com erro:',bad or 'nenhum')
print('\n== 2) PADRÕES DE RISCO (só no código da extensão, fora a wa-js de terceiros) ==')
ext=[f for f in js if f not in ('lib/wppconnect-wa.js','tools/gerar-wrapalvos.js')]
pad={'innerHTML':r'\.innerHTML\s*=|insertAdjacentHTML|outerHTML\s*=','eval/Function':r'\beval\s*\(|new Function\s*\(','document.write':r'document\.write','console.*':r'console\.(log|debug|info)\s*\(','debugger':r'\bdebugger\b','TODO/FIXME':r'\b(TODO|FIXME|XXX|HACK)\b',
     'postMessage("*")':r"postMessage\([^)]*,\s*['\"]\*['\"]\)",'http:// (sem TLS)':r"['\"]http://(?!localhost)",'segredo no código':r"AIza[0-9A-Za-z_-]{20,}|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9._-]{20,}"}
for nome,rx in pad.items():
    hits=[]
    for f in ext:
        for i,l in enumerate(R(f).split('\n'),1):
            if re.search(rx,l): hits.append(f'{f}:{i}')
    print(f'  {nome:22} {len(hits):3}',hits[:6])
print('\n== 3) MANIFESTO ==')
m=json.loads(R('manifest.json')); 
for k in ('manifest_version','name','version','permissions','host_permissions','optional_permissions','content_security_policy','web_accessible_resources','background','action','minimum_chrome_version'): print(f'  {k}:',json.dumps(m.get(k),ensure_ascii=False)[:230])
for c in m['content_scripts']: print('  content_script:',c.get('world','ISOLATED'),c.get('run_at'),c['matches'],len(c['js']),'js')
