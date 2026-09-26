declare module "reflect-metadata" {
    // augment global Reflect
}

declare namespace Reflect {
    function getMetadata(metadataKey: any, target: any, targetKey?: string | symbol): any;
    function defineMetadata(metadataKey: any, metadataValue: any, target: any, targetKey?: string | symbol): void;
    function hasMetadata(metadataKey: any, target: any, targetKey?: string | symbol): boolean;
}
