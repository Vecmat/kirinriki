import "reflect-metadata";

// Core
export { Kirinriki, createApp } from "./core/app";
export { Container, container, BeanScope, BeanType } from "./core/container";
export { Exception, createException } from "./core/exception";
export { Router } from "./core/router";

// Decorators - Component
export { Component, Service, Controller, Action, Middleware, Autowired, Inject } from "./decorators/component";

// Decorators - Route
export { Get, Post, Put, Delete, Patch, Options, Head, All, HttpMethod } from "./decorators/route";

// Decorators - Params
export { ParamsQuery, ParamsPath, ParamsBody, ParamsHeader, Ctx } from "./decorators/param";

// Decorators - AOP
export { Before, After, Around } from "./decorators/aop";

// Decorators - Exception
export { Catched, Exception as ExceptionDecorator } from "./decorators/exception";

// Decorators - Validation
export { Valid, Validated } from "./decorators/validation";
