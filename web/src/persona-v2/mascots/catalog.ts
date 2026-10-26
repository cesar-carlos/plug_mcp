import marmaladePortrait from "./marmalade/portrait.png";
import marmaladeAtlas from "./marmalade/spritesheet.webp";
import marmaladePackage from "./marmalade.zip?url";
import voltcoinPortrait from "./voltcoin/portrait.png";
import voltcoinAtlas from "./voltcoin/spritesheet.webp";
import voltcoinPackage from "./voltcoin.zip?url";
import license from "./LICENSE.txt?url";

export const mascotLicense = license;
export const mascots = [
  {
    id: "marmalade",
    name: "Marmalade",
    description: "Gato laranja tranquilo.",
    portrait: marmaladePortrait,
    atlas: marmaladeAtlas,
    package: marmaladePackage,
  },
  {
    id: "voltcoin",
    name: "Voltcoin",
    description: "Companheiro amarelo com uma moeda.",
    portrait: voltcoinPortrait,
    atlas: voltcoinAtlas,
    package: voltcoinPackage,
  },
] as const;
