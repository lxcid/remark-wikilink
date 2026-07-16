import type { Options, WikiEmbed, WikiLink } from "@lxcid/remark-wikilink/gfm";
import type { PhrasingContent, RootContent } from "mdast";

const options: Options = { singleTilde: false };

const wikiLink: WikiLink = {
  type: "wikiLink",
  target: "Note",
  alias: null,
};

const wikiEmbed: WikiEmbed = {
  type: "wikiEmbed",
  target: "image.png",
  alias: null,
};

const phrasingContent: Array<PhrasingContent> = [wikiLink, wikiEmbed];
const rootContent: Array<RootContent> = [wikiLink, wikiEmbed];

void phrasingContent;
void rootContent;
void options;
