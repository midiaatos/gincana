/* =========================================================================
   Placar da Gincana — configuração
   -------------------------------------------------------------------------
   1) Firebase (tempo real entre celulares e telão)
      Console do Firebase > Configurações do projeto > Seus apps > App da Web.
      Copie o objeto firebaseConfig e cole abaixo NO LUGAR do null.
      Confira se veio o campo databaseURL; se não vier, copie o endereço
      que aparece no topo da tela do Realtime Database.

      Enquanto ficar null, o sistema roda em MODO DEMONSTRAÇÃO:
      só sincroniza abas abertas no MESMO navegador (bom para testar layout).

   2) A apiKey do Firebase para web não é senha; quem protege os dados são
      as regras (database.rules.json) e o código da sala que vai no link.
   ========================================================================= */

window.PLACAR_FIREBASE = null;

/* Exemplo (substitua pelos dados do seu projeto):
window.PLACAR_FIREBASE = {
  apiKey: "AIza...",
  authDomain: "placar-gincana.firebaseapp.com",
  databaseURL: "https://placar-gincana-default-rtdb.firebaseio.com",
  projectId: "placar-gincana",
  appId: "1:000000000000:web:0000000000000000"
};
*/

/* Nomes iniciais. Depois dá para trocar pelo celular em Ajustes,
   junto com as logos, sem mexer no código. */
window.PLACAR_PADRAO = {
  titulo: "Gincana",
  equipeAzul: "Equipe Azul",
  equipeVerde: "Equipe Verde"
};
