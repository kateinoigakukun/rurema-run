import { WASI } from "@wasmer/wasi";
import { WasmFs } from "@wasmer/wasmfs";

class RubyCache {
  cache: WebAssembly.Module | null;
  fetchStarted: boolean;
  onFetched: Promise<WebAssembly.Module>;
  onFetchedResolve: (module: WebAssembly.Module) => void;
  onFetchedReject: (error: Error) => void;

  constructor() {
    this.cache = null;
    this.fetchStarted = false;
    this.onFetched = new Promise((resolve, reject) => {
      this.onFetchedResolve = resolve;
      this.onFetchedReject = reject;
    });
  }
  async get(): Promise<WebAssembly.Module> {
    // fetch the wasm file if it's not in the cache, and return it.
    // if it's in the cache, return it.
    if (this.cache) {
      return this.cache;
    } else if (this.fetchStarted) {
      return this.onFetched;
    } else {
      this.fetchStarted = true;
      try {
        // @ts-ignore
        const result = await fetch(chrome.runtime.getURL("/ruby.wasm"));
        const binary = await result.arrayBuffer();
        const module = await WebAssembly.compile(binary);
        this.cache = module;
        this.onFetchedResolve(module);
        return module;
      } catch (e) {
	this.onFetchedReject(e);
	throw e;
      }
    }
  }
}

const cache = new RubyCache();

const runRubyCode = async (code: string, writeResult: (text: string) => void) => {
  const wasmFs = new WasmFs();
  const originalWriteSync = wasmFs.fs.writeSync;
  // @ts-ignore
  wasmFs.fs.writeSync = (fd, buffer, offset, length, position) => {
    const text = new TextDecoder("utf-8").decode(buffer);
    switch (fd) {
      case 1:
        writeResult(text);
        break;
      case 2:
        writeResult(text);
        break;
    }
    return originalWriteSync(fd, buffer, offset, length, position);
  };
  const wasi = new WASI({
    args: ["ruby", "-e", code],
    bindings: {
      ...WASI.defaultBindings,
      fs: wasmFs.fs,
    }
  });
  const module = await cache.get();
  const instance = await WebAssembly.instantiate(module, {
    wasi_snapshot_preview1: wasi.wasiImport
  });
  wasi.start(instance);
};

const createRunButton = () => {
  const span = document.createElement("span");
  span.style.float = "right";
  span.style.margin = "0 -1.0em 0.25em 1.5em";
  span.style.padding = "0.25em 0.5em";
  span.style.background = "#DDD";
  span.style.opacity = "0.75";
  span.style.cursor = "pointer";

  span.innerText = "RUN";
  return span;
}

const main = () => {
  console.log("loaded rurema extension")
  const exampleElements: NodeListOf<HTMLPreElement> = document.querySelectorAll("pre.ruby");

  for (const element of exampleElements) {
    element.contentEditable = "true";

    const button = createRunButton();
    let resultView: HTMLElement | null = null;
    button.onclick = () => {
      if (resultView == null) {
        resultView = document.createElement("pre");
      } else {
        resultView.innerText = "";
      }
      element.parentElement.insertBefore(resultView, element.nextElementSibling)

      const rawCode = element.getElementsByTagName("code")[0].innerText;
      // if code starts with newline, strip it
      const code = rawCode.startsWith("\n") ? rawCode.slice(1) : rawCode;
      runRubyCode(code, (text) => {
        resultView.innerText += text;
      });
    };
    element.prepend(button);
  }
}

(function () {
  main();
})();
