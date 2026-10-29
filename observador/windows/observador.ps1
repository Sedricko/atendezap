# Observador do Windows: a cada 5 s anota o programa e a janela em uso em Documentos\Observador\AAAA-MM-DD.txt
# e pergunta "por quê" na primeira vez do dia em cada programa. Tudo fica só neste computador.
# Para pausar: rode pausar.bat (cria/apaga o arquivo PAUSADO ao lado deste script). Para parar: Gerenciador de Tarefas > Windows PowerShell.
Add-Type @"
using System; using System.Runtime.InteropServices; using System.Text;
public static class Janela {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [StructLayout(LayoutKind.Sequential)] public struct LII { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LII i);
  public static uint SegundosParado() { var i = new LII(); i.cbSize = (uint)Marshal.SizeOf(i); GetLastInputInfo(ref i); return ((uint)Environment.TickCount - i.dwTime) / 1000; }
}
"@
Add-Type -AssemblyName Microsoft.VisualBasic

$pasta = Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'Observador'
New-Item -ItemType Directory -Force $pasta | Out-Null
# Programas/janelas nunca registrados: o título é trocado por "privado". Acrescente o que for pessoal.
$privado = 'banco|itaú|itau|bradesco|caixa|santander|nubank|inter|sicoob|sicredi|mercado pago|paypal|senha|password|keepass|bitwarden|1password'
$naoPerguntar = 'explorer|ShellExperienceHost|SearchHost|LockApp|powershell'
$ultimo = ''; $dia = ''; $perguntados = @{}

while ($true) {
  Start-Sleep -Seconds 5
  if (Test-Path (Join-Path $PSScriptRoot 'PAUSADO')) { continue }
  $hoje = Get-Date -Format 'yyyy-MM-dd'
  if ($hoje -ne $dia) { $dia = $hoje; $perguntados = @{} }
  $arq = Join-Path $pasta "$hoje.txt"

  $prog = ''; $titulo = ''
  if ([Janela]::SegundosParado() -gt 300) { $atual = 'ausente (5 min sem mexer)' }
  else {
    $h = [Janela]::GetForegroundWindow()
    $sb = New-Object System.Text.StringBuilder 512
    [void][Janela]::GetWindowText($h, $sb, 512)
    $procId = [uint32]0
    [void][Janela]::GetWindowThreadProcessId($h, [ref]$procId)
    $prog = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
    $titulo = $sb.ToString()
    $atual = if ("$prog $titulo" -match $privado) { 'privado' } else { "$prog | $titulo" }
  }
  if ($atual -eq $ultimo -or (-not $prog -and $atual -notlike 'ausente*')) { continue }  # sem janela (área de trabalho): ignora
  $ultimo = $atual
  Add-Content -Encoding UTF8 $arq ("{0} | {1}" -f (Get-Date -Format 'HH:mm'), $atual)

  if (-not $prog -or $atual -eq 'privado' -or $prog -match $naoPerguntar -or $perguntados[$prog]) { continue }
  $perguntados[$prog] = $true
  $porque = [Microsoft.VisualBasic.Interaction]::InputBox("Por que você está usando $($prog) agora?`n`n$titulo`n`n(deixe vazio para pular hoje)", 'Observador', '')
  if ($porque) { Add-Content -Encoding UTF8 $arq "    porque: $porque" }
}
