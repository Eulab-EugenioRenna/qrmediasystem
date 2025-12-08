import urllib.request
import urllib.parse
import json
import sys
import time

BASE_URL = "http://localhost/api"

def request(method, url, data=None, headers=None, is_form=False):
    if headers is None:
        headers = {}
    
    if data:
        if is_form:
             data_bytes = urllib.parse.urlencode(data).encode('utf-8')
             headers['Content-Type'] = 'application/x-www-form-urlencoded'
        else:
             data_bytes = json.dumps(data).encode('utf-8')
             headers['Content-Type'] = 'application/json'
    else:
        data_bytes = None
        
    req = urllib.request.Request(url, data=data_bytes, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as response:
            return response.getcode(), json.load(response)
    except urllib.error.HTTPError as e:
        # Try to read error body
        try:
            body = json.load(e)
        except:
            body = None
        return e.code, body
    except Exception as e:
        print(f"Request failed: {e}")
        return 0, None

def run_test():
    print("Testing Block One Live (urllib)...")
    
    # 1. Login
    code, resp = request("POST", f"{BASE_URL}/token", {"username": "admin", "password": "admin"}, is_form=True)
    if code != 200:
        print(f"Login failed: {code} {resp}. Server might not be running or creds wrong.")
        return
        
    token = resp['access_token']
    auth_headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Setup
    # Create unique names to avoid collisions if running multiple times?
    ts = int(time.time())
    c, rec = request("POST", f"{BASE_URL}/admin/recipients", {"name": f"TestUser_{ts}", "email": "test@test.com"}, auth_headers)
    if c != 200: print(f"Create recipient failed: {c}"); return
    
    c, alb = request("POST", f"{BASE_URL}/admin/albums", {"title": f"TestAlbum_{ts}"}, auth_headers)
    if c != 200: print(f"Create album failed: {c}"); return

    # Query param handling in urllib need to be manual or part of url
    c, assign = request("POST", f"{BASE_URL}/admin/assign?recipient_id={rec['id']}&album_id={alb['id']}", {}, auth_headers)
    if c != 200: print(f"Assign failed: {c} {assign}"); return
    
    assign_token = assign['token']
    print(f"Assignment Token: {assign_token}")
    
    # 3. Client A
    headers_a = {"User-Agent": "ClientA/1.0"}
    c, data_a = request("GET", f"{BASE_URL}/public/view/{assign_token}", headers=headers_a)
    if c != 200: print(f"Client A failed: {c}"); return
    
    session_a = data_a['session_token']
    print(f"Session A: {session_a}")
    
    # 4. Client B (Should Fail now)
    # We use different User-Agent to simulate different client
    headers_b = {"User-Agent": "ClientB/1.0"}
    c, data_b = request("GET", f"{BASE_URL}/public/view/{assign_token}", headers=headers_b)
    if c == 403:
        print("Client B blocked (Success)")
    else:
        print(f"Client B NOT blocked! Code: {c}")
        #sys.exit(1) # Don't exit yet, check stats
        
    # Test 3: Client A logs event (Deduping)
    print("Client A logging view event (1st time)...")
    # Must use same headers/UA if strict? Actually /event doesn't check UA but relies on token?
    # Backend /event checks session token validity. Session token is linked to UA? No, it's just a token. 
    # But usually browser sends UA. Let's send it to be safe.
    c, _ = request("POST", f"{BASE_URL}/public/event", {
        "session_token": session_a,
        "event_type": "view_assignment",
        "details": "Checking in"
    }, headers=headers_a)
    if c == 200:
        print("Event logged (OK)")
    else:
        print(f"Event logging failed: {c}")

    print("Client A logging view event (2nd time - Should match but backend allows duplicates by default unless strict? We added strict deduping 10s window)")
    c, r = request("POST", f"{BASE_URL}/public/event", {
        "session_token": session_a,
        "event_type": "view_assignment",
        "details": "Checking in again"
    }, headers=headers_a)
    # Our backend returns {"status": "ignored"} if deduplicated, but HTTP 200 likely
    if c == 200 and r.get('status') == 'ignored':
        print("Deduping worked (Ignored)")
    else:
        print(f"Deduping check result: {c} {r} (If status!=ignored, might need adjustment if logic was strict)")

    # Test 4: Grace Period (Simulate Same Client Refresh)
    # Same IP (implicit) AND Same User-Agent -> Should allow takeover
    print("Same Client (Simulated) connecting without token (Takeover)...")
    c, data_takeover = request("GET", f"{BASE_URL}/public/view/{assign_token}", headers=headers_a)
    if c == 200:
        print("Takeover allowed (Grace Period OK)")
        session_a = data_takeover['session_token'] # New token
    else:
        print(f"Takeover FAILED: {c} (Grace period logic issue?)")
        
    # Test 5: Client A Leaves
    print("Client A leaving explicitly...")
    request("POST", f"{BASE_URL}/public/leave", {"session_token": session_a}, headers=headers_a)
    
    # Test 6: Client B connects IMMEDIATELY (Should succeed now that A left)
    print("Client B connecting immediately...")
    c, data_b = request("GET", f"{BASE_URL}/public/view/{assign_token}", headers=headers_b)
    if c == 200:
        print("Client B connected (Explicit Release OK)")
    else:
        print(f"Client B Blocked after Leave! {c}")

    # Test 7: Verify Stats
    c, stats = request("GET", f"{BASE_URL}/admin/assignments/{assign['id']}/stats", None, auth_headers)
    if c == 200:
        print(f"Stats: {stats}")
        # View count should be 1 (deduped or maybe 2 if takeover counted as new?)
        # Logic says: 1st view logged. 2nd view ignored. Takeover might trigger frontend to log again... 
        # But here we are just testing backend constraint.
        if stats['total_views'] >= 1:
            print("Stats verification PASSED")
        else:
            print("Stats verification FAILED (counts low)")
    else:
        print(f"Stats fetch failed: {c}")

    # Test 8: Delete Assignment (Regression Test)
    print("Deleting assignment...")
    c, del_resp = request("DELETE", f"{BASE_URL}/admin/assignments/{assign['id']}", headers=auth_headers)
    if c == 200:
        print("Assignment deleted successfully.")
    else:
        print(f"Assignment deletion FAILED (Error): {c} {del_resp}")

    # Cleanup Album/Recipient
    request("DELETE", f"{BASE_URL}/admin/albums/{alb['id']}", headers=auth_headers)
    request("DELETE", f"{BASE_URL}/admin/recipients/{rec['id']}", headers=auth_headers)

if __name__ == "__main__":
    run_test()
