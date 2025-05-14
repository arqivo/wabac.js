import { getCSP, getStatusText } from "./utils";

export function notFound(request: Request, msg?: string, status = 404) {
  return notFoundByTypeResponse(request, request.url, "", false, status, msg);
}

export function notFoundByTypeResponse(
  request: Request,
  requestURL: string,
  requestTS: string,
  liveRedirectOnNotFound = false,
  status = 404,
  msg?: string,
) {
  let content: string;
  let contentType: string;

  switch (request.destination as string) {
    case "json":
    case "":
      content = getJSONNotFound(requestURL, requestTS, msg);
      contentType = "application/json; charset=utf-8";
      break;

    case "script":
      content = getScriptCSSNotFound("Script", requestURL, requestTS, msg);
      contentType = "text/javascript; charset=utf-8";
      break;

    case "style":
      content = getScriptCSSNotFound("CSS", requestURL, requestTS, msg);
      contentType = "text/css; charset=utf-8";
      break;

    case "document":
    case "embed":
    case "iframe":
    case "frame":
    default:
      content = getHTMLNotFound(
        request,
        requestURL,
        requestTS,
        liveRedirectOnNotFound,
        msg,
      );
      contentType = "text/html; charset=utf-8";
  }

  return textToResponse(content, contentType, status);
}

function textToResponse(content: string, contentType: string, status = 200) {
  const buff = new TextEncoder().encode(content);

  const initOpt = {
    status: status,
    statusText: getStatusText(status),
    headers: {
      "Content-Type": contentType,
      "Content-Length": buff.length + "",
      "Content-Security-Policy": getCSP(),
    },
  };

  return new Response(buff, initOpt);
}

function getHTMLNotFound(
  request: Request,
  requestURL: string,
  requestTS: string,
  liveRedirectOnNotFound: boolean,
  msg?: string,
) {
  return `
  <!doctype html>
  <html>
  <head>

  <script src="https://cdn.tailwindcss.com"></script>

  </head>
  <body>




<div class="flex justify-center h-screen sm:items-center">

    <div class="inline-block max-w-4xl px-8 py-6 font-medium text-center bg-white rounded-md">        

        <div class="font-bold text sm:text-4xl">Dit gedeelte wordt niet gearchiveerd</div>
        <div class="text-gray-400">${requestURL}</div>

        <div class="hidden mt-0 sm:block">Deze pagina of dit onderdeel van de website valt buiten het webarchief. Gebruik de onderstaande knop om de URL in een nieuw venster te openen en de actuele versie te bekijken.</div>


        <a href="${requestURL}" class="hidden sm:inline-flex  mt-10 items-center gap-x-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="-ml-0.5 h-5 w-5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13.5 6H5.25A2.25 2.25 0 0 0 3 8.25v10.5A2.25 2.25 0 0 0 5.25 21h10.5A2.25 2.25 0 0 0 18 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
            </svg>
            Bekijk actuele versie
        </a>        

    </div>

</div>

  <script>

    const inIframe = window.self !== window.top;

    if (!inIframe) {

        // Get collection from URL
        const path = window.location.pathname;
        const coll = path.startsWith('/w/') ? path.split('/')[2] : '';

        const url = '${requestURL}';
        const encodedUrl = url === decodeURIComponent(url) ? encodeURIComponent(url) : url;
        const redirectUri =  window.location.origin + '?action=redirect&coll=' + coll + '&url=' + encodedUrl + '&timestamp=${requestTS}';
        
        // console.log('Should redirect to: ', redirectUri);
        
        window.location.href = redirectUri;

    }


    if (inIframe) {

        window.parent.postMessage({
        wb_type: "archive-not-found",
        url: "${requestURL}",
        ts: "${requestTS}"
        }, "*");
    }

  </script>
  </body>
  </html>
  `;
}

function getScriptCSSNotFound(
  type: string,
  requestURL: string,
  requestTS: string,
  msg?: string,
) {
  return `\
/* 
   ${msg ? msg : type + " Not Found"}
   URL: ${requestURL}
   TS: ${requestTS}
*/
  `;
}

function getJSONNotFound(URL: string, TS: string, error = "not_found") {
  return JSON.stringify({ error, URL, TS });
}

export function getProxyNotFoundResponse(url: string, status: number) {
  return textToResponse(getHTMLNotProxyError(url, status), "text/html", status);
}

function getHTMLNotProxyError(requestURL: string, status: number) {
  return `
  <!doctype html>
  <html>
  <head>
  <script>
  window.requestURL = "${requestURL}";
  </script>
  </head>
  <body style="font-family: sans-serif">
  <h2>Live page could not be loaded</h2>
  <p>Sorry, this page was could not be loaded through the archiving proxy. Check the URL and try again.</p>
  <p><code id="url" style="word-break: break-all; font-size: larger">Status Code: ${status}</code></p>
  <p id="goback" style="display: none"><a href="#" onclick="window.history.back()">Go Back</a> to the previous page.</a></p>

  <script>
  let isTop = true;
  try {
    if (window.parent._WB_wombat_location) {
      isTop = false;
    }
  } catch (e) {

  }
  if (isTop) {
    document.querySelector("#goback").style.display = "";

    window.parent.postMessage({
      wb_type: "live-proxy-url-error",
      url: window.requestURL,
      status: ${status},
    }, "*");
  }
  </script>
  </body>
  </html>
  `;
}
