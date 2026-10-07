import subprocess
import yaml


def find(cur, name):
    cur.execute(f"SELECT * FROM users WHERE name = '{name}'")


def run(cmd):
    subprocess.run(cmd, shell=True)


def load(text):
    return yaml.load(text)


def safe(cur, name):
    cur.execute("SELECT * FROM users WHERE name = %s", (name,))
    return yaml.load(name, Loader=yaml.SafeLoader)
