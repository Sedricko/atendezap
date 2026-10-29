// mcs -langversion:5 -r:/usr/lib/mono/4.5/WindowsBase.dll -out:/tmp/t.exe windows/entrada.cs windows/teste/*.cs && mono /tmp/t.exe   (pasta observador; no Linux)
using System;
class T { static void Eq(string a, string b) { if (a != b) { Console.WriteLine("FALHOU: [" + a + "] != [" + b + "]"); Environment.Exit(1); } }
  static void Main() {
    Eq(Entrada.Compor("´", "a"), "á"); Eq(Entrada.Compor("~", "a"), "ã"); Eq(Entrada.Compor("^", "e"), "ê");
    Eq(Entrada.Compor("`", "a"), "à"); Eq(Entrada.Compor("´", " "), "´"); Eq(Entrada.Compor("´", "x"), "´x");
    foreach (var k in new[] { "a", "\u0001~", "o", "\b", "\u0001´", "e", "s" }) Entrada.Adiciona(k);  // a ~o ⌫ ´e s
    Eq(Entrada.Pega(), "aés"); Eq(Entrada.Pega(), "");
    Console.WriteLine("ok");
  } }
