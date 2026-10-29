// Observador: lê a janela em uso, o teclado e o mouse (Windows). Carregado pelo observador.ps1 com Add-Type.
// O texto digitado fica num buffer só na memória até o script gravar no arquivo do dia; nada sai do computador.
using System;
using System.Collections.Concurrent;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Automation;

public static class Janela {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [StructLayout(LayoutKind.Sequential)] struct LII { public uint cbSize; public uint dwTime; }
  [DllImport("user32.dll")] static extern bool GetLastInputInfo(ref LII i);
  public static uint SegundosParado() { var i = new LII(); i.cbSize = (uint)Marshal.SizeOf(i); GetLastInputInfo(ref i); return ((uint)Environment.TickCount - i.dwTime) / 1000; }
  public static string Titulo() { var sb = new StringBuilder(512); GetWindowText(GetForegroundWindow(), sb, 512); return sb.ToString(); }
  public static uint Processo() { uint pid; GetWindowThreadProcessId(GetForegroundWindow(), out pid); return pid; }
}

public static class Entrada {
  // Eventos em ordem: {"texto", "..."} ou {"clique", "Nome (tipo)"}. O script esvazia a cada segundo.
  public static ConcurrentQueue<string[]> Fila = new ConcurrentQueue<string[]>();
  public static volatile bool Privado;   // janela privada ou pausado: o script liga/desliga
  public static volatile bool Senha;     // campo de senha em foco: ligado pelo próprio Windows (UI Automation)

  delegate IntPtr Proc(int n, IntPtr w, IntPtr l);
  static Proc tecladoProc = Teclado, mouseProc = Mouse;  // referências fixas: o coletor de lixo não pode soltar os ganchos
  [DllImport("user32.dll")] static extern IntPtr SetWindowsHookEx(int id, Proc p, IntPtr mod, uint tid);
  [DllImport("user32.dll")] static extern IntPtr CallNextHookEx(IntPtr h, int n, IntPtr w, IntPtr l);
  [DllImport("kernel32.dll")] static extern IntPtr GetModuleHandle(string nome);
  [StructLayout(LayoutKind.Sequential)] struct MSG { public IntPtr h; public uint m; public IntPtr w, l; public uint t; public int x, y; }
  [DllImport("user32.dll")] static extern int GetMessage(out MSG m, IntPtr h, uint a, uint b);
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int vk);
  [DllImport("user32.dll")] static extern short GetKeyState(int vk);
  [DllImport("user32.dll")] static extern IntPtr GetKeyboardLayout(uint tid);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int ToUnicodeEx(uint vk, uint sc, byte[] st, StringBuilder sb, int n, uint flags, IntPtr hkl);

  static readonly object trava = new object();
  static StringBuilder texto = new StringBuilder();
  static string morta;  // acento esperando a letra (´ ~ ^ ` ¨)

  public static void Iniciar() {
    var t = new Thread(() => {
      SetWindowsHookEx(13, tecladoProc, GetModuleHandle(null), 0);  // WH_KEYBOARD_LL
      SetWindowsHookEx(14, mouseProc, GetModuleHandle(null), 0);    // WH_MOUSE_LL
      MSG m; while (GetMessage(out m, IntPtr.Zero, 0, 0) > 0) { }
    });
    t.IsBackground = true;
    t.Start();
    // registrado numa thread MTA: o PowerShell roda em STA, e UI Automation em STA sem fila de mensagens pode travar
    ThreadPool.QueueUserWorkItem(_ => Automation.AddAutomationFocusChangedEventHandler((s, e) => {
      try { Senha = ((AutomationElement)s).Current.IsPassword; } catch { Senha = false; }
      if (Senha) Pega();  // descarta o que estava no buffer
    }));
  }

  static bool Baixa(int vk) { return (GetAsyncKeyState(vk) & 0x8000) != 0; }

  static IntPtr Teclado(int n, IntPtr w, IntPtr l) {
    if (n >= 0 && !Privado && !Senha && ((int)w == 0x100 || (int)w == 0x104)) {  // WM_KEYDOWN, WM_SYSKEYDOWN
      try { Adiciona(Tecla((uint)Marshal.ReadInt32(l), (uint)Marshal.ReadInt32(l, 4))); } catch { }
    }
    return CallNextHookEx(IntPtr.Zero, n, w, l);
  }

  static string Tecla(uint vk, uint sc) {
    if (vk == 8) return "\b";
    if (vk == 13) return "\n";
    bool ctrl = Baixa(0x11), alt = Baixa(0x12);
    if (ctrl && !alt && vk >= 0x41 && vk <= 0x5A) return "[Ctrl+" + (char)vk + "]";  // atalhos: Ctrl+C, Ctrl+V…
    var st = new byte[256];
    if (Baixa(0x10)) st[0x10] = 0x80;
    if ((GetKeyState(0x14) & 1) != 0) st[0x14] = 1;
    if (ctrl) st[0x11] = 0x80;
    if (alt) st[0x12] = 0x80;  // Ctrl+Alt = AltGr
    var sb = new StringBuilder(8);
    // flag 4: não mexe no estado do teclado, senão os acentos do usuário param de funcionar
    int r = ToUnicodeEx(vk, sc, st, sb, 8, 4, GetKeyboardLayout(TidJanela()));
    if (r < 0) return "\u0001" + sb.ToString(0, 1);
    if (r == 0) return "";
    var s = sb.ToString(0, r);
    return char.IsControl(s[0]) && s != "\t" ? "" : s;
  }
  static uint TidJanela() { uint pid; return Janela.GetWindowThreadProcessId(Janela.GetForegroundWindow(), out pid); }

  static IntPtr Mouse(int n, IntPtr w, IntPtr l) {
    if (n >= 0 && !Privado && ((int)w == 0x201 || (int)w == 0x204)) {  // botão esquerdo ou direito
      int x = Marshal.ReadInt32(l), y = Marshal.ReadInt32(l, 4);
      string antes = Pega();
      if (antes != "") Fila.Enqueue(new[] { "texto", antes });
      // o nome do que foi clicado é lido fora do gancho: o Windows desliga ganchos que demoram
      ThreadPool.QueueUserWorkItem(_ => { var nome = NomeEm(x, y); if (nome != "") Fila.Enqueue(new[] { "clique", nome }); });
    }
    return CallNextHookEx(IntPtr.Zero, n, w, l);
  }

  static string NomeEm(int x, int y) {
    try {
      var c = AutomationElement.FromPoint(new System.Windows.Point(x, y)).Current;
      if (c.IsPassword) return "";
      var nome = (c.Name ?? "").Replace("\n", " ").Trim();
      if (nome.Length > 60) nome = nome.Substring(0, 60);
      return nome == "" ? c.LocalizedControlType ?? "" : nome + " (" + c.LocalizedControlType + ")";
    } catch { return ""; }
  }

  public static void Adiciona(string k) {
    lock (trava) {
      if (k == "") return;
      if (k == "\b") { if (texto.Length > 0) texto.Length--; return; }
      if (k[0] == '\u0001') { morta = k.Substring(1); return; }
      if (morta != null) { k = Compor(morta, k); morta = null; }
      texto.Append(k);
    }
  }

  public static string Pega() { lock (trava) { var s = texto.ToString(); texto.Clear(); morta = null; return s; } }

  public static string Compor(string m, string k) {
    if (k == " ") return m;
    string c = m == "´" ? "́" : m == "`" ? "̀" : m == "~" ? "̃" : m == "^" ? "̂" : m == "¨" ? "̈" : null;
    if (c == null) return m + k;
    var s = (k + c).Normalize(NormalizationForm.FormC);
    return s.Length == 1 ? s : m + k;
  }
}
