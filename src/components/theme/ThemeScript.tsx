export function ThemeScript() {
  const script = `(function(){try{var k='lp-theme',t=localStorage.getItem(k);if(t!=='light'&&t!=='dark')t='dark';document.documentElement.setAttribute('data-theme',t)}catch(e){document.documentElement.setAttribute('data-theme','dark')}})();`;

  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
