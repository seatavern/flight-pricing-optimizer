"""Update one existing container's image, preserve configuration, and verify readiness."""
import copy
import json
import os
import subprocess
import time

from smoke_test import check


def az(*args: str):
    result = subprocess.run(["az", *args, "--output", "json", "--only-show-errors"],
                            check=True, capture_output=True, text=True)
    return json.loads(result.stdout) if result.stdout.strip() else None


def stable_config(app):
    properties = app["properties"]
    template = copy.deepcopy(properties["template"])
    template.pop("revisionSuffix", None)
    for container in template["containers"]:
        if container["name"] == os.environ["CONTAINER_APP"]:
            container.pop("image", None)
    return {"configuration": properties["configuration"], "template": template,
            "identity": app.get("identity"), "tags": app.get("tags"),
            "environmentId": properties.get("environmentId"),
            "managedEnvironmentId": properties.get("managedEnvironmentId"),
            "workloadProfileName": properties.get("workloadProfileName")}


def main():
    name, group = os.environ["CONTAINER_APP"], os.environ["RESOURCE_GROUP"]
    common = ("--name", name, "--resource-group", group)
    before = az("containerapp", "show", *common)
    expected_host = os.environ["APP_URL"].removeprefix("https://")
    assert before["properties"]["configuration"]["ingress"]["fqdn"] == expected_host
    containers = before["properties"]["template"]["containers"]
    previous_image = next(c["image"] for c in containers if c["name"] == name)
    image = os.environ["IMAGE"]
    try:
        az("containerapp", "update", *common, "--container-name", name, "--image", image)
        deadline = time.monotonic() + 900
        while True:
            after = az("containerapp", "show", *common)
            properties = after["properties"]
            if stable_config(before) != stable_config(after):
                raise RuntimeError("Deployment changed configuration beyond the image")
            if properties.get("latestReadyRevisionName") == properties["latestRevisionName"]:
                break
            if time.monotonic() >= deadline:
                raise RuntimeError("New revision did not become ready")
            time.sleep(10)
        actual_image = next(c["image"] for c in properties["template"]["containers"] if c["name"] == name)
        assert actual_image == image, "Unexpected deployed image"
        check(os.environ["APP_URL"], 300)
        print(f"Verified revision {properties['latestRevisionName']} using {image}")
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
            summary.write(f"Deployed `{image}` to existing app `{name}`.\n\n"
                          f"Frontend, API and model checks passed. Configuration preserved.\n\n"
                          f"Previous image for rollback: `{previous_image}`\n")
    except Exception:
        print("Deployment verification failed. Restoring the previous image.", flush=True)
        az("containerapp", "update", *common, "--container-name", name, "--image", previous_image)
        raise


if __name__ == "__main__":
    main()
