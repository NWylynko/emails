"use client";

import Pusher from "pusher-js";
import { createContext, useContext, useEffect, useState } from "react";
import { createStore, useStore, type StoreApi } from "zustand";

type Store = {
  updates: number;
  reset: () => void;
};

const context = createContext<StoreApi<Store> | null>(null);

export const UpdatesProvider = (props: { children: React.ReactNode }) => {
  const [store] = useState(() =>
    createStore<Store>()((set) => ({
      updates: 0,
      reset: () => set({ updates: 0 }),
    }))
  );

  useEffect(() => {
    const pusher = new Pusher("16f0a5d23fb65028d3ad", {
      cluster: "ap4",
    });

    const channel = pusher.subscribe("updates");

    channel.bind("update", () => {
      store.setState({ updates: store.getState().updates + 1 });
    });

    return () => {
      channel.unbind("update");
    };
  }, []);

  return <context.Provider value={store}>{props.children}</context.Provider>;
};

export const useUpdates = () => {
  const state = useContext(context);

  if (state === null) {
    throw new Error("useUpdates must be used within a UpdatesProvider");
  }

  return useStore(state, (store) => store.updates);
};

export const useReset = () => {
  const state = useContext(context);

  if (state === null) {
    throw new Error("useReset must be used within a UpdatesProvider");
  }

  return useStore(state, (store) => store.reset);
};
