// Authored loader cases exercise executed binding identity, including equal exports.
export const lazyChoices = [
	{
		name: "conditional module first",
		loader: `()=>globalThis.choice?import('shared/ui/leaf'):import('shared/ui/other')`,
		module: "shared/ui/leaf.tsx",
		exported: "default",
	},
	{
		name: "conditional module second",
		loader: `()=>!globalThis.choice?import('shared/ui/leaf'):import('shared/ui/other')`,
		module: "shared/ui/other.tsx",
		exported: "default",
	},
	{
		name: "conditional export first",
		loader: `()=>import('shared/ui/barrel').then(m=>({default:globalThis.choice?m.First:m.Second}))`,
		module: "shared/ui/barrel.ts",
		exported: "First",
	},
	{
		name: "conditional export second",
		loader: `()=>import('shared/ui/barrel').then(m=>({default:!globalThis.choice?m.First:m.Second}))`,
		module: "shared/ui/barrel.ts",
		exported: "Second",
		owner: "other.tsx",
	},
	{
		name: "equal value first binding",
		loader: `()=>import('shared/ui/barrel').then(m=>({default:globalThis.choice?m.First:m.Alias}))`,
		module: "shared/ui/barrel.ts",
		exported: "First",
	},
	{
		name: "equal value second binding",
		loader: `()=>import('shared/ui/barrel').then(m=>({default:!globalThis.choice?m.First:m.Alias}))`,
		module: "shared/ui/barrel.ts",
		exported: "Alias",
	},
	{
		name: "stored preserved",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};return result})`,
		module: "shared/ui/barrel.ts",
		exported: "First",
		owner: "leaf.tsx",
	},
	{
		name: "stored replaced",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};result.default=m.Second;return result})`,
		module: "shared/ui/barrel.ts",
		exported: "Second",
		owner: "other.tsx",
	},
	{
		name: "stored equal function replacement",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};result.default=m.Alias;return result})`,
		module: "shared/ui/barrel.ts",
		exported: "Alias",
		owner: "leaf.tsx",
	},
	{
		name: "aliased object replacement",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};const alias=result;alias.default=m.Second;return result})`,
		module: "shared/ui/barrel.ts",
		exported: "Second",
		owner: "other.tsx",
	},
	{
		name: "copy preserves earlier origin",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};const copy={...result};result.default=m.Alias;return copy})`,
		module: "shared/ui/barrel.ts",
		exported: "First",
		owner: "leaf.tsx",
	},
	{
		name: "copy retains replacement origin",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};result.default=m.Alias;const copy={...result};return copy})`,
		module: "shared/ui/barrel.ts",
		exported: "Alias",
		owner: "leaf.tsx",
	},
	{
		name: "projection from copied default",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.Second};const copy={default:result.default};return copy})`,
		module: "shared/ui/barrel.ts",
		exported: "Second",
		owner: "other.tsx",
	},
	{
		name: "later callback replacement",
		loader: `()=>import('shared/ui/barrel').then(m=>({default:m.First})).then(async result=>{const m=await import('shared/ui/barrel');result.default=m.Alias;return result})`,
		module: "shared/ui/barrel.ts",
		exported: "Alias",
		owner: "leaf.tsx",
	},
	{
		name: "later callback preserves copy",
		loader: `()=>import('shared/ui/barrel').then(m=>({default:m.First})).then(async result=>{const copy={...result};const m=await import('shared/ui/barrel');result.default=m.Second;return copy})`,
		module: "shared/ui/barrel.ts",
		exported: "First",
		owner: "leaf.tsx",
	},
	{
		name: "conditional copied default",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};result.default=globalThis.choice?m.Second:m.Alias;const copy={...result};return copy})`,
		module: "shared/ui/barrel.ts",
		exported: "Second",
		owner: "other.tsx",
	},
	{
		name: "namespace spread",
		loader: `()=>import('shared/ui/leaf').then(m=>({...m}))`,
		module: "shared/ui/leaf.tsx",
		exported: "default",
	},
	{
		name: "computed first",
		loader: `()=>import('./parts/'+globalThis.pick+'.tsx')`,
		module: "frames/home/parts/first.tsx",
		exported: "default",
		pick: "first",
	},
	{
		name: "computed second",
		loader: `()=>import('./parts/'+globalThis.pick+'.tsx')`,
		module: "frames/home/parts/second.tsx",
		exported: "default",
		pick: "second",
	},
	{
		name: "async preserved namespace",
		loader: `async()=>{globalThis.loads++;const m=await import('shared/ui/leaf');await Promise.resolve();return m}`,
		module: "shared/ui/leaf.tsx",
		exported: "default",
	},
	{
		name: "async projected replacement",
		loader: `async()=>{globalThis.loads++;const m=await import('shared/ui/barrel');await Promise.resolve();return {default:m.Second}}`,
		module: "shared/ui/barrel.ts",
		exported: "Second",
		owner: "other.tsx",
	},
	{
		name: "indirect resolved namespace",
		loader: `()=>Promise.resolve(globalThis.namespace)`,
		setup: `import * as UI from 'shared/ui/leaf';globalThis.namespace=UI;`,
		module: "shared/ui/leaf.tsx",
		exported: "default",
	},
];
export const consumedChoices = [
	{
		name: "spread later accessor cannot overwrite default origin",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={get default(){globalThis.reads++;return m.First},get extra(){globalThis.reads++;return m.Alias}};return {...result}})`,
	},
	{
		name: "untracked return cannot borrow an unrelated helper receipt",
		loader: `()=>import('shared/ui/barrel').then(m=>{const local=m.First;function unrelated(){return m.Alias};return {get default(){unrelated();return local}}})`,
	},
	{
		name: "separate occurrences consume equal function slots",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={get default(){globalThis.reads++;return globalThis.reads%2?m.First:m.Alias}};globalThis.afterCommit=()=>{void result.default};return result})`,
	},
	{
		name: "unknown proxy refused without descriptor probes",
		loader: `async()=>{const m=await import('shared/ui/leaf');return new Proxy({default:globalThis.other},{getOwnPropertyDescriptor(target,key){globalThis.traps.descriptor++;return Reflect.getOwnPropertyDescriptor(target,key)}})}`,
	},
	{
		name: "opaque mutation through passed object",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};globalThis.mutate=Function('r','v','r.default=v');globalThis.mutate(result,m.Alias);return result})`,
	},
	{
		name: "opaque mutation through global alias",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};globalThis.saved=result;globalThis.replacement=m.Alias;globalThis.mutate=Function('globalThis.saved.default=globalThis.replacement');globalThis.mutate();return result})`,
	},
	{
		name: "opaque getter after descriptor replacement",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};globalThis.replacement=m.Alias;Object.defineProperty(result,'default',{get:Function('return globalThis.replacement')});return result})`,
	},
	{
		name: "getter default",
		loader: `()=>import('shared/ui/leaf').then(m=>({get default(){globalThis.reads++;return m.Button}}))`,
	},
	{
		name: "later replacement",
		loader: `()=>import('shared/ui/barrel').then(m=>({default:m.First})).then(result=>{result.default=globalThis.other;return result})`,
	},
	{
		name: "getter member on arbitrary object",
		loader: `async()=>{const actual=await import('shared/ui/leaf');const fake={get Button(){globalThis.reads++;return actual.Button}};return {default:fake.Button}}`,
	},
	{
		name: "equal named local function",
		loader: `()=>import('shared/ui/leaf').then(m=>({default:globalThis.other}))`,
	},

	{
		name: "escaped alias replaces equal function",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};globalThis.saved=result;globalThis.saved.default=m.Alias;return result})`,
	},
	{
		name: "detached callback can change a consumed default",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};const pending=import('shared/ui/barrel').then(n=>{result.default=n.Alias;return result});return result})`,
	},
	{
		name: "unknown call mutates result",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};((r)=>{r.default=m.Alias})(result);return result})`,
	},
	{
		name: "descriptor installs getter",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={default:m.First};Object.defineProperty(result,'default',{get(){globalThis.reads++;return m.Alias}});return result})`,
	},
	{
		name: "getter spread has application reads",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={get default(){globalThis.reads++;return m.Alias}};return {...result}})`,
	},
	{
		name: "same function getter log changes after commit",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result={get default(){globalThis.reads++;globalThis.lastSlot=globalThis.after?'Alias':'First';return globalThis.after?m.Alias:m.First}};globalThis.afterCommit=()=>{globalThis.after=true;void result.default};return result})`,
	},
	{
		name: "proxy spread retains ordinary traps",
		loader: `()=>import('shared/ui/barrel').then(m=>{const result=new Proxy({default:m.First},{ownKeys(target){globalThis.traps.ownKeys++;globalThis.reads++;return Reflect.ownKeys(target)},getOwnPropertyDescriptor(target,key){globalThis.traps.descriptor++;globalThis.reads++;return Reflect.getOwnPropertyDescriptor(target,key)},get(target,key,receiver){globalThis.traps.get++;globalThis.reads++;return Reflect.get(target,key,receiver)}});return {...result}})`,
	},
	{
		name: "copied then export escapes during promise resolution",
		loader: `()=>import('shared/ui/thenable').then(m=>{globalThis.install++;const result={...m};result.default=m.default;return result})`,
	},
	{
		name: "proxy result descriptors",
		loader: `async()=>{const m=await import('shared/ui/leaf');const result=new Proxy({default:m.Button},{getOwnPropertyDescriptor(target,key){globalThis.traps.descriptor++;globalThis.reads++;return Reflect.getOwnPropertyDescriptor(target,key)}});return result}`,
	},
];
