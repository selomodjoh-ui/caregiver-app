// index.html is the public welcome page. A script in its <head> decides, before
// anything is drawn, whether this visit is for the app (signed in, a ?link from
// a button or an email, a sign-in #hash, or the phone app) and marks <html> with
// "app-mode". Only then is the app's code and CSS loaded, so the welcome page
// stays light and its styles never meet the app's.
if (document.documentElement.classList.contains('app-mode')) {
  document.getElementById('welcome')?.remove();
  document.getElementById('welcome-css')?.remove();
  import('./boot');
}
