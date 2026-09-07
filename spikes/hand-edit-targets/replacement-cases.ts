export const replacementCases = [
	{
		name: "clone preserves every prop",
		body: `return cloneElement(children)`,
		call: `<Pass><Button label="Same"/></Pass>`,
	},
	{
		name: "clone replaces equal label",
		body: `return cloneElement(children,{label:'Same'})`,
		call: `<Pass><Button label="Same"/></Pass>`,
	},
	{
		name: "clone replaces label",
		body: `return cloneElement(children,{label:'Changed'})`,
		call: `<Pass><Button label="Same"/></Pass>`,
	},
	{
		name: "clone preserves children and class",
		body: `return cloneElement(children,{title:'New'})`,
		call: `<Pass><strong className="p-4">Same</strong></Pass>`,
	},
	{
		name: "clone replaces class and preserves children",
		body: `return cloneElement(children,{className:'p-8'})`,
		call: `<Pass><strong className="p-4">Same</strong></Pass>`,
	},
	{
		name: "clone replaces inline style and preserves children",
		body: `return cloneElement(children,{style:{padding:32}})`,
		call: `<Pass><strong style={{padding:16}}>Same</strong></Pass>`,
	},
	{
		name: "clone replaces children and preserves style",
		body: `return cloneElement(children,{},'Changed')`,
		call: `<Pass><strong className="p-4">Same</strong></Pass>`,
	},
	{
		name: "clone replaces named slot",
		body: `return cloneElement(children,{header:<Button label="Replacement"/>})`,
		call: `<Pass><Header header={<Button label="Same"/>}/></Pass>`,
	},
	{
		name: "recreated component has no observed creation",
		body: `return createElement(children.type,{label:'Same'})`,
		call: `<Pass><Button label="Same"/></Pass>`,
	},
	{
		name: "Children.toArray creates keyed elements",
		body: `return Children.toArray(children)`,
		call: `<Pass><Button label="Same"/><Button label="Same"/></Pass>`,
	},
	{
		name: "cached first child between different callers",
		body: `globalThis.saved??=children;return globalThis.saved`,
		call: `<><Pass><Button label="Same"/></Pass><Pass><Button label="Same"/></Pass></>`,
	},
	{ name: "named header slot", body: `return header`, call: `<Pass header={<Button label="Same"/>}/>` },
	{
		name: "changed conditional child relationship",
		body: `return children`,
		call: `<Pass>{flip ? <Button label="Same"/> : <Button label="Same" />}</Pass>`,
	},
	{
		name: "changed named slot relationship",
		body: `return flip ? footer : header`,
		call: `<Pass flip={flip} header={<Button label="Same"/>} footer={<Button label="Same"/>}/>`,
	},
	{
		name: "ordinary unobserved component createElement",
		body: `return children`,
		call: `{createElement(Button,{label:'Same'})}`,
	},
	{
		name: "ordinary unobserved host createElement",
		body: `return children`,
		call: `{createElement('strong',{className:'p-4'},'Same')}`,
	},
] as const;
