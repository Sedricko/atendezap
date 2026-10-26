"""Busca unificada de repositórios por palavra-chave: GitHub, GitLab e Codeberg.

Uso:  python busca.py palavra chave [--n 10]
Token opcional do GitHub (mais buscas por minuto): variável GITHUB_TOKEN.
"""
import json, os, sys, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor


def get(url, headers=None):
    req = urllib.request.Request(url, headers={"User-Agent": "busca-unificada", **(headers or {})})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)


def github(k):
    tok = os.environ.get("GITHUB_TOKEN")
    d = get(f"https://api.github.com/search/repositories?q={k}&per_page=30",
            {"Authorization": f"Bearer {tok}"} if tok else None)
    return [(r["full_name"], r["html_url"], r["description"], r["stargazers_count"]) for r in d["items"]]


def gitlab(k):
    d = get(f"https://gitlab.com/api/v4/projects?search={k}&order_by=star_count&per_page=30")
    return [(r["path_with_namespace"], r["web_url"], r["description"], r["star_count"]) for r in d]


def codeberg(k):
    d = get(f"https://codeberg.org/api/v1/repos/search?q={k}&sort=stars&order=desc&limit=30")
    return [(r["full_name"], r["html_url"], r["description"], r["stars_count"]) for r in d["data"]]


FONTES = {"GitHub": github, "GitLab": gitlab, "Codeberg": codeberg}
# Bitbucket ficou de fora: a API não tem mais listagem/busca pública global (404).


def buscar(palavras, n=10):
    k = urllib.parse.quote(palavras)

    def uma(nome):
        try:
            return nome, FONTES[nome](k)[:n], None
        except Exception as e:  # uma plataforma fora do ar não derruba as outras
            return nome, [], str(e)

    with ThreadPoolExecutor() as ex:
        return list(ex.map(uma, FONTES))


def main():
    args = sys.argv[1:]
    n = 10
    if "--n" in args:
        i = args.index("--n")
        n = int(args[i + 1])
        del args[i:i + 2]
    if not args:
        sys.exit(__doc__)
    for nome, repos, erro in buscar(" ".join(args), n):
        print(f"\n=== {nome} ({len(repos)}) ===" + (f"  erro: {erro}" if erro else ""))
        for repo, link, desc, estrelas in repos:
            print(f"  ★{estrelas:<6} {repo}\n          {link}\n          {(desc or '').strip()[:100]}")


if __name__ == "__main__":
    main()
