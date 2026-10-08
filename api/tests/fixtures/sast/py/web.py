import hashlib
import os
import subprocess

import requests
from flask import redirect, render_template_string, request
from lxml import etree


def fetch():
    url = request.args.get("url")
    return requests.get(url)                 # SSRF


def run_cmd():
    name = request.form["name"]
    os.system("ping " + name)                # command injection
    subprocess.run("echo " + name, shell=True)


def read_file():
    p = request.args.get("path")
    return open(p).read()                    # path traversal


def render():
    tpl = request.values.get("tpl")
    return render_template_string(tpl)       # SSTI


def do_eval():
    expr = request.args.get("expr")
    return eval(expr)                        # code injection


def go():
    target = request.args.get("next")
    return redirect(target)                  # open redirect


def parse_xml():
    data = request.data
    return etree.fromstring(data)            # XXE (pattern)


def digest(password):
    return hashlib.md5(password.encode()).hexdigest()  # weak hash (pattern)


def safe_fetch():
    return requests.get("https://api.internal/health")  # constant, not tainted
