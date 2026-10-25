import re,sys
marca=sys.argv[1]; prefixo=tuple(sys.argv[2].split(',')); saida=sys.argv[3]
L=open('test/smoke.py',encoding='utf-8').read().split('\n')
def idx(pred,ini=0):
    for i in range(ini,len(L)):
        if pred(L[i]): return i
    raise SystemExit('marcador não achado')
i_res=idx(lambda l:l.strip()=="res = {}")
i_d0=idx(lambda l:'async def dlg_next' in l); i_d1=idx(lambda l:'async def sub_atend' in l)+2
i_s0=idx(lambda l:"self.__iaLog = []; self.__fetchReal" in l); i_s1=idx(lambda l:re.search(r'\}\)\(\)"""\)',l) is not None,i_s0)
i_c0=idx(lambda l:l.strip().startswith("cfg = {'cfgVersao'")); i_c1=idx(lambda l:'json.dumps(cfg))' in l and 'atendCfg' in l,i_c0)
i_h0=idx(lambda l:'async def chega(chat, texto, mim=False):' in l); i_h1=idx(lambda l:'return await sw.evaluate("self.__iaLog.length")' in l,i_h0)
i_b0=idx(lambda l:marca in l); i_b1=idx(lambda l:(sys.argv[4] if len(sys.argv)>4 else '# limite diário e chave ausente') in l,i_b0)
i_e0=idx(lambda l:l.strip()=="esperado = {"); i_e1=idx(lambda l:l.strip()=="}",i_e0)
esp=[l for l in L[i_e0+1:i_e1] if any(("'"+p) in l for p in prefixo)]
abre=["        await page.locator('#az-panel .handle').click(); await page.wait_for_timeout(600)",
 "        await sw.evaluate(\"chrome.storage.local.set({ iaCfg: { chave: 'AIza-teste', chaves: ['AIza-teste'], modelo: 'gemini-3.6-flash', limiteDia: 100 } })\"); await page.wait_for_timeout(600)"]
fim=["        res['errors'] = errors","        esperado = {"]+esp+["        }","        res['_regressoes'] = [k for k, f in esperado.items() if not f(res.get(k))]","        print(json.dumps(res, indent=1, ensure_ascii=False))","        await ctx.close()","asyncio.run(main())"]
out=L[:i_res+1]+L[i_d0:i_d1]+L[i_s0-1:i_s1+1]+L[i_c0:i_c1+1]+L[i_h0:i_h1+1]+abre+L[i_b0:i_b1]+fim
open(saida,'w',encoding='utf-8').write('\n'.join(out)+'\n'); print('linhas',len(out),'| verificações',len(esp))
