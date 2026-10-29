# Observador do Windows: anota em Documentos\Observador\AAAA-MM-DD.txt a hora em que você começa, cada programa/janela
# que usa, o que escreve (o texto final, já com as correções) e o nome do que clica. Na primeira vez do dia em cada
# programa, pergunta "por quê". Serve só para a IA aprender o seu jeito; tudo fica só neste computador.
# Nunca registra: campos de senha, janelas da lista $privado e o tempo em que o arquivo PAUSADO existir (pausar.bat).
# Para parar: Gerenciador de Tarefas > Windows PowerShell > Finalizar tarefa.
Add-Type -Path (Join-Path $PSScriptRoot 'entrada.cs') -ReferencedAssemblies UIAutomationClient, UIAutomationTypes, WindowsBase
Add-Type -AssemblyName Microsoft.VisualBasic

$pasta = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Observador'
New-Item -ItemType Directory -Force $pasta | Out-Null
# Janelas nunca registradas (nem o texto, nem os cliques). Acrescente o que for pessoal, separado por |.
$privado = 'banco|itaú|itau|bradesco|caixa|santander|nubank|inter|sicoob|sicredi|mercado pago|paypal|senha|password|keepass|bitwarden|1password'
$naoPerguntar = 'explorer|ShellExperienceHost|SearchHost|LockApp|powershell'
$ultimo = ''; $dia = ''; $tick = 0

function Grava($linha) { Add-Content -Encoding UTF8 $arq $linha }
function Escreve($tipo, $v) {
  if ($tipo -eq 'clique') { if ($v) { Grava "    clicou: $v" }; return }
  $v = "$v".Trim() -replace "`r?`n", ' ⏎ '
  if ($v) { Grava "    escreveu: $v" }
}
function Esvazia($comTexto) {  # grava, na ordem, o que foi digitado e clicado
  $ev = $null
  while ([Entrada]::Fila.TryDequeue([ref]$ev)) { Escreve $ev[0] $ev[1] }
  if ($comTexto) { Escreve 'texto' ([Entrada]::Pega()) }
}
function Descarta { [void][Entrada]::Pega(); $ev = $null; while ([Entrada]::Fila.TryDequeue([ref]$ev)) { } }

[Entrada]::Iniciar()
while ($true) {
  Start-Sleep -Seconds 1
  $hoje = Get-Date -Format 'yyyy-MM-dd'
  if ($hoje -ne $dia) {
    $dia = $hoje; $perguntados = @{}
    $arq = Join-Path $pasta "$hoje.txt"
    $comecou = (Test-Path $arq) -and (Select-String -Quiet -SimpleMatch 'começou a trabalhar' $arq)
  }

  $prog = ''; $titulo = ''
  if (Test-Path (Join-Path $PSScriptRoot 'PAUSADO')) { $atual = 'pausado' }
  elseif ([Janela]::SegundosParado() -gt 300) { $atual = 'ausente (5 min sem mexer)' }
  else {
    $prog = (Get-Process -Id ([Janela]::Processo()) -ErrorAction SilentlyContinue).ProcessName
    $titulo = [Janela]::Titulo()
    $atual = if ("$prog $titulo" -match $privado) { 'privado' } else { "$prog | $titulo" }
  }
  [Entrada]::Privado = $atual -in 'privado', 'pausado'
  if ([Entrada]::Privado) { Descarta }

  $tick++
  if ($atual -eq $ultimo -or (-not $prog -and $atual -notlike 'ausente*' -and $atual -ne 'privado')) {  # mesma janela, ou área de trabalho
    Esvazia ($tick % 60 -eq 0)  # o texto vai para o arquivo a cada minuto, ao clicar ou ao trocar de janela
    continue
  }
  Esvazia $true  # o que foi feito na janela anterior fica embaixo dela
  $ultimo = $atual
  if ($atual -eq 'pausado') { continue }
  if ($prog -and -not $comecou) { Grava ("== começou a trabalhar: {0} ==" -f (Get-Date -Format 'HH:mm')); $comecou = $true }
  Grava ("{0} | {1}" -f (Get-Date -Format 'HH:mm'), $atual)

  if (-not $prog -or $atual -eq 'privado' -or $prog -match $naoPerguntar -or $perguntados[$prog]) { continue }
  $perguntados[$prog] = $true
  [Entrada]::Privado = $true  # a resposta do "por quê" não entra como texto digitado
  $porque = [Microsoft.VisualBasic.Interaction]::InputBox("Por que você está usando $($prog) agora?`n`n$titulo`n`n(deixe vazio para pular hoje)", 'Observador', '')
  Descarta
  [Entrada]::Privado = $false
  if ($porque) { Grava "    porque: $porque" }
}
