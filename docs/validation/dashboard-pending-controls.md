# Dashboard controls during a pending connection

Base: exact PR68 source76f8dca263ddee5c10fcf3acf61077c8448a7632. The lead verified no active AutoFix check before this isolated local edit; ordinary Bugbot was still running. No remote branch was written.

A live connector request already causes the backend to reject separate dashboard repository Connect and standalone Verify. The dashboard now disables those controls and tells the user to choose the existing Continue or Cancel action first. Connect remains account-purpose with no connector ref; only explicit Cancel carries the exact live ref. Connector-context Verify behavior is unchanged. Existing disconnect, signout, revoke-all and Continue/Cancel controls remain available.

The focused test creates a real encrypted BrowserSessions identity, continuation and pending sign-in, renders its dashboard state, inspects the actionable forms, and confirms denied forged Connect/Verify attempts leave the complete persisted state unchanged. Explicit Cancel retains the same identity and allows the ordinary dashboard controls again. This uses the real session implementation and page renderer with local storage; it is not a browser interaction, actual GitHub grant or deployment proof. No authorization, session, provider or custody implementation changes are included.
