// stub mínimo de UI Automation só para compilar no Linux
namespace System.Windows.Automation {
  public class AutomationFocusChangedEventArgs : System.EventArgs {}
  public delegate void AutomationFocusChangedEventHandler(object s, AutomationFocusChangedEventArgs e);
  public static class Automation { public static void AddAutomationFocusChangedEventHandler(AutomationFocusChangedEventHandler h) {} }
  public class AutomationElement { public static AutomationElement FromPoint(System.Windows.Point p) { return null; }
    public Info Current { get { return new Info(); } }
    public struct Info { public bool IsPassword { get { return false; } } public string Name { get { return ""; } } public string LocalizedControlType { get { return ""; } } } }
}
