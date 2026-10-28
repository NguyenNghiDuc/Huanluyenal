import { useEffect, useState } from "react";
import { api } from "./api";
export default function useConversationSearch(query, items) {
  const [state, setState] = useState({
    items: [],
    loading: false,
    error: "",
    forQuery: "",
  });
  const trimmed = query.trim();
  useEffect(() => {
    if (!trimmed) {
      setState({ items: [], loading: false, error: "", forQuery: "" });
      return;
    }
    const controller = new AbortController();
    setState({ items: [], loading: true, error: "", forQuery: trimmed });
    const timer = setTimeout(() => {
      api("/conversations?q=" + encodeURIComponent(trimmed), {
        signal: controller.signal,
      })
        .then((result) => {
          if (!controller.signal.aborted)
            setState({
              items: result,
              loading: false,
              error: "",
              forQuery: trimmed,
            });
        })
        .catch((e) => {
          if (!controller.signal.aborted)
            setState({
              items: [],
              loading: false,
              error: e.message,
              forQuery: trimmed,
            });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, items]);
  if (!trimmed) return { items, loading: false, error: "", searching: false };
  if (state.forQuery !== trimmed)
    return { items: [], loading: true, error: "", searching: true };
  return { ...state, searching: true };
}
