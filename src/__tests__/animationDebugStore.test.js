/**
 * @jest-environment jsdom
 */
import { render } from "@testing-library/react";
import React from "react";
import { getDebugSnapshot, getFrozen, registerActiveAnimation, scaleDuration, setDebugState, setLastGhostRects, subscribeDebug, } from "../react/debug/animationDebugStore.js";
import { GhostRectsOverlay } from "../react/debug/GhostRectsOverlay.js";
describe("animationDebugStore", () => {
    beforeEach(() => {
        setDebugState({
            enabled: false,
            speed: 1,
            frozen: null,
            showAim: false,
            showGhostRects: false,
            forceReducedMotion: false,
            lastGhostRects: null,
        });
    });
    describe("scaleDuration", () => {
        it("is identity when disabled", () => {
            expect(scaleDuration(250)).toBe(250);
        });
        it("is identity when speed is 1", () => {
            setDebugState({ enabled: true, speed: 1 });
            expect(scaleDuration(250)).toBe(250);
        });
        it("divides by speed when enabled and speed !== 1", () => {
            setDebugState({ enabled: true, speed: 0.1 });
            expect(scaleDuration(250)).toBe(2500);
            setDebugState({ speed: 2 });
            expect(scaleDuration(250)).toBe(125);
        });
        it("scales duration by dividing ms by speed", () => {
            setDebugState({ enabled: true, speed: 10 });
            expect(scaleDuration(16)).toBe(1.6);
        });
    });
    describe("getFrozen", () => {
        it("returns null when not enabled", () => {
            setDebugState({ frozen: { kind: "page-expand", progress: 0.5 } });
            expect(getFrozen("page-expand")).toBeNull();
        });
        it("returns progress for matching kind", () => {
            setDebugState({ enabled: true, frozen: { kind: "page-expand", progress: 0.65 } });
            expect(getFrozen("page-expand")).toBe(0.65);
        });
        it("returns null for non-matching kind", () => {
            setDebugState({ enabled: true, frozen: { kind: "page-expand", progress: 0.5 } });
            expect(getFrozen("page-collapse")).toBeNull();
        });
        it('"any" kind matches any call site', () => {
            setDebugState({ enabled: true, frozen: { kind: "any", progress: 0.3 } });
            expect(getFrozen("page-expand")).toBe(0.3);
            expect(getFrozen("page-collapse")).toBe(0.3);
        });
        it("clamps progress to [0, 1]", () => {
            setDebugState({ enabled: true, frozen: { kind: "any", progress: 2 } });
            expect(getFrozen("page-expand")).toBe(1);
            setDebugState({ frozen: { kind: "any", progress: -1 } });
            expect(getFrozen("page-expand")).toBe(0);
        });
    });
    describe("subscribe/setState", () => {
        it("notifies subscribers on state change", () => {
            const listener = jest.fn();
            const unsub = subscribeDebug(listener);
            setDebugState({ speed: 2 });
            expect(listener).toHaveBeenCalledTimes(1);
            setDebugState({ speed: 3 });
            expect(listener).toHaveBeenCalledTimes(2);
            unsub();
            setDebugState({ speed: 4 });
            expect(listener).toHaveBeenCalledTimes(2);
        });
        it("exposes updated state via getDebugSnapshot", () => {
            setDebugState({ enabled: true, speed: 0.5 });
            const snap = getDebugSnapshot();
            expect(snap.enabled).toBe(true);
            expect(snap.speed).toBe(0.5);
        });
    });
    describe("setLastGhostRects", () => {
        it("stores rects and notifies subscribers", () => {
            const listener = jest.fn();
            subscribeDebug(listener);
            const rect = new DOMRect(10, 20, 100, 50);
            setLastGhostRects({ source: rect, target: null });
            expect(getDebugSnapshot().lastGhostRects).toEqual({ source: rect, target: null });
            expect(listener).toHaveBeenCalled();
        });
    });
    describe("console API", () => {
        it("installs window.__dcAnimationDebug", () => {
            const api = window.__dcAnimationDebug;
            expect(api).toBeDefined();
            expect(typeof api?.enable).toBe("function");
            expect(typeof api?.setSpeed).toBe("function");
            expect(typeof api?.scrub).toBe("function");
        });
        it("setSpeed clamps to [0.05, 10]", () => {
            const api = window.__dcAnimationDebug;
            api.setSpeed(0.01);
            expect(getDebugSnapshot().speed).toBe(0.05);
            api.setSpeed(100);
            expect(getDebugSnapshot().speed).toBe(10);
            api.setSpeed(Number.NaN);
            expect(getDebugSnapshot().speed).toBe(1);
        });
        it("scrub sets frozen state", () => {
            const api = window.__dcAnimationDebug;
            api.enable();
            api.scrub(0.7, "page-expand");
            expect(getFrozen("page-expand")).toBe(0.7);
        });
        it("step mutates activeAnim.currentTime", () => {
            const api = window.__dcAnimationDebug;
            let currentTime = 100;
            const fakeAnim = {
                get currentTime() {
                    return currentTime;
                },
                set currentTime(v) {
                    currentTime = v;
                },
                pause: () => { },
                play: () => { },
            };
            registerActiveAnimation(fakeAnim);
            api.step(16);
            expect(currentTime).toBe(116);
            registerActiveAnimation(null);
        });
    });
    describe("GhostRectsOverlay", () => {
        it("renders nothing when showGhostRects is off", () => {
            setDebugState({
                showGhostRects: false,
                lastGhostRects: { source: new DOMRect(0, 0, 10, 10), target: null },
            });
            const { container } = render(React.createElement(GhostRectsOverlay));
            expect(container.querySelector("[data-dc-debug-ghost-overlay]")).toBeNull();
        });
        it("renders nothing when rects are null even if flag is on", () => {
            setDebugState({ showGhostRects: true, lastGhostRects: null });
            const { container } = render(React.createElement(GhostRectsOverlay));
            expect(container.querySelector("[data-dc-debug-ghost-overlay]")).toBeNull();
        });
        it("paints source and target rect borders when both are present", () => {
            setDebugState({
                showGhostRects: true,
                lastGhostRects: {
                    source: new DOMRect(10, 20, 100, 50),
                    target: new DOMRect(200, 100, 300, 400),
                },
            });
            const { container } = render(React.createElement(GhostRectsOverlay));
            expect(container.querySelector("[data-dc-debug-ghost-overlay]")).not.toBeNull();
            const labels = container.querySelectorAll("[data-dc-debug-ghost-overlay] > div");
            expect(labels.length).toBe(2);
        });
    });
});
