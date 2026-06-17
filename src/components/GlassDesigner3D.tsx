'use client';

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js';

interface KonvaShape {
    id: string;
    type: 'glass_rect' | 'glass_circle' | 'hole' | 'cut' | 'glass_polygon' | 'accessory';
    x: number;
    y: number;
    width?: number;
    height?: number;
    radius?: number;
    sides?: number;
    points?: number[];
    accessoryType?: 'lock' | 'connector' | 'hinge' | 'profile';
    accessoryName?: string;
    parentId?: string;
    zOffset?: number;
    rotX?: number;
    rotY?: number;
    rotZ?: number;
}

interface GlassDesigner3DProps {
    shapes: KonvaShape[];
    thickness: number; // in mm
    selectedShapeId?: string | null;
    onSelectShape?: (id: string | null) => void;
    onShapeTransform?: (id: string, updates: Partial<KonvaShape>) => void;
}

export default function GlassDesigner3D({ 
    shapes, 
    thickness, 
    selectedShapeId, 
    onSelectShape, 
    onShapeTransform 
}: GlassDesigner3DProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    // Helpers to compute polygon points relative to standard sizing
    const getPolygonPoints = (sides: number, width: number, height: number): number[] => {
        const points: number[] = [];
        const rx = width / 2;
        const ry = height / 2;
        const cx = rx;
        const cy = ry;
        for (let i = 0; i < sides; i++) {
            const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
            points.push(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle));
        }
        return points;
    };

    useEffect(() => {
        if (!containerRef.current) return;

        const containerWidth = containerRef.current.clientWidth || 800;
        const containerHeight = containerRef.current.clientHeight || 650;

        // Scene Setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x111827); // slate-900 color

        // Camera Setup
        const camera = new THREE.PerspectiveCamera(45, containerWidth / containerHeight, 0.1, 1000);

        // Renderer Setup
        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(containerWidth, containerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        containerRef.current.appendChild(renderer.domElement);

        // Controls Setup
        const controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.05;
        controls.maxPolarAngle = Math.PI / 2 + 0.1; // Don't go too far below ground

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
        scene.add(ambientLight);

        // Key light
        const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
        keyLight.position.set(30, 40, 30);
        scene.add(keyLight);

        // Fill light (so the back and bottom aren't pitch black)
        const fillLight = new THREE.DirectionalLight(0xa5f3fc, 0.35); // slight cyan glow for glass edges
        fillLight.position.set(-30, -10, -30);
        scene.add(fillLight);

        // Spotlight for shininess
        const spotLight = new THREE.SpotLight(0xffffff, 0.5, 80, Math.PI / 6, 0.5, 1);
        spotLight.position.set(0, 20, 40);
        scene.add(spotLight);

        // Floor Grid
        const gridHelper = new THREE.GridHelper(60, 60, 0x374151, 0x1f2937);
        gridHelper.position.y = -12;
        scene.add(gridHelper);

        // Glass Thickness (1 unit = 1 inch, thickness in mm -> inches)
        const thicknessIn = thickness / 25.4;

        // Filter glass parent shapes
        const glassShapes = shapes.filter(s => s.type === 'glass_rect' || s.type === 'glass_circle' || s.type === 'glass_polygon');

        // Bounding box calculation for centering
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        glassShapes.forEach(s => {
            if (s.type === 'glass_rect' || s.type === 'glass_polygon') {
                const w = s.width || 0;
                const h = s.height || 0;
                minX = Math.min(minX, s.x);
                maxX = Math.max(maxX, s.x + w);
                minY = Math.min(minY, s.y);
                maxY = Math.max(maxY, s.y + h);
            } else if (s.type === 'glass_circle') {
                const r = s.radius || 0;
                minX = Math.min(minX, s.x - r);
                maxX = Math.max(maxX, s.x + r);
                minY = Math.min(minY, s.y - r);
                maxY = Math.max(maxY, s.y + r);
            }
        });

        if (minX === Infinity) {
            minX = 0; maxX = 200; minY = 0; maxY = 150;
        }
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        const maxDim = Math.max((maxX - minX) / 10, (maxY - minY) / 10);
        camera.position.set(maxDim * 0.2, maxDim * 0.4, maxDim * 1.5);
        controls.target.set(0, 0, 0);

        // Child containment helper
        const isInsideParent = (child: KonvaShape, parent: KonvaShape) => {
            if (child.parentId === parent.id) return true;
            if (child.parentId) return false; // linked to a different parent
            // Fallback coordinate check
            if (parent.type === 'glass_rect' || parent.type === 'glass_polygon') {
                const w = parent.width || 0;
                const h = parent.height || 0;
                return (child.x >= parent.x && child.x <= parent.x + w &&
                        child.y >= parent.y && child.y <= parent.y + h);
            } else if (parent.type === 'glass_circle') {
                const r = parent.radius || 0;
                return (child.x >= parent.x - r && child.x <= parent.x + r &&
                        child.y >= parent.y - r && child.y <= parent.y + r);
            }
            return false;
        };

        // Materials setup
        const glassMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xecfeff, // nice light cyan tint
            transparent: true,
            opacity: 0.4,
            transmission: 0.88,
            roughness: 0.05,
            metalness: 0.1,
            ior: 1.52, // refractive index of glass
            thickness: thicknessIn,
            side: THREE.DoubleSide,
            depthWrite: false
        });

        const metalMaterial = new THREE.MeshStandardMaterial({
            color: 0xd1d5db, // chrome/silver
            metalness: 0.9,
            roughness: 0.18
        });

        const darkMetalMaterial = new THREE.MeshStandardMaterial({
            color: 0x1f2937, // dark gray profile channel
            metalness: 0.75,
            roughness: 0.35
        });

        const brassMaterial = new THREE.MeshStandardMaterial({
            color: 0xf59e0b, // gold/brass keyhole
            metalness: 0.85,
            roughness: 0.22
        });

        // Loop over glass shapes to build extruded 3D meshes
        glassShapes.forEach(parent => {
            const glassGroup = new THREE.Group();
            
            // 1. Calculate centroid / center of rotation for the glass shape (in canvas space)
            let cx_abs = parent.x;
            let cy_abs = parent.y;
            let centroidX = 0;
            let centroidY = 0;

            if (parent.type === 'glass_rect') {
                cx_abs = parent.x + (parent.width || 100) / 2;
                cy_abs = parent.y + (parent.height || 100) / 2;
            } 
            else if (parent.type === 'glass_circle') {
                cx_abs = parent.x;
                cy_abs = parent.y;
            } 
            else if (parent.type === 'glass_polygon') {
                const pts = parent.points || getPolygonPoints(parent.sides || 4, parent.width || 100, parent.height || 100);
                let sumX = 0, sumY = 0;
                for (let i = 0; i < pts.length; i += 2) {
                    sumX += pts[i];
                    sumY += pts[i+1];
                }
                const count = pts.length / 2;
                centroidX = sumX / count;
                centroidY = sumY / count;
                cx_abs = parent.x + centroidX;
                cy_abs = parent.y + centroidY;
            }

            // Group absolute position in the 3D scene (inches)
            const groupX = (cx_abs - centerX) / 10;
            const groupY = -(cy_abs - centerY) / 10;
            const groupZ = parent.zOffset || 0; // zOffset in inches

            // 2. Build local 2D shape relative to local origin (0, 0)
            const threeShape = new THREE.Shape();

            if (parent.type === 'glass_rect') {
                const w = (parent.width || 100) / 10;
                const h = (parent.height || 100) / 10;
                // Center is (0, 0), so top-left corner is at (-w/2, h/2)
                const px = -w / 2;
                const py = h / 2;

                threeShape.moveTo(px, py);
                threeShape.lineTo(px + w, py);
                threeShape.lineTo(px + w, py - h);
                threeShape.lineTo(px, py - h);
                threeShape.closePath();
            }
            else if (parent.type === 'glass_circle') {
                const r = (parent.radius || 50) / 10;
                // Center is (0, 0)
                threeShape.absarc(0, 0, r, 0, Math.PI * 2, false);
            }
            else if (parent.type === 'glass_polygon') {
                const pts = parent.points || getPolygonPoints(parent.sides || 4, parent.width || 100, parent.height || 100);
                if (pts.length >= 6) {
                    // Start relative to centroid
                    const x0 = (pts[0] - centroidX) / 10;
                    const y0 = -(pts[1] - centroidY) / 10;
                    threeShape.moveTo(x0, y0);
                    for (let i = 2; i < pts.length; i += 2) {
                        const xi = (pts[i] - centroidX) / 10;
                        const yi = -(pts[i + 1] - centroidY) / 10;
                        threeShape.lineTo(xi, yi);
                    }
                    threeShape.closePath();
                }
            }

            // 3. Find and add child holes and cuts inside this glass parent shape relative to group origin
            shapes.forEach(child => {
                if (child.id !== parent.id && isInsideParent(child, parent)) {
                    if (child.type === 'hole') {
                        // local coords relative to cx_abs, cy_abs
                        const lcx = (child.x - cx_abs) / 10;
                        const lcy = -(child.y - cy_abs) / 10;
                        const hr = (child.radius || 10) / 10;
                        
                        const holePath = new THREE.Path();
                        holePath.absarc(lcx, lcy, hr, 0, Math.PI * 2, true);
                        threeShape.holes.push(holePath);
                    }
                    else if (child.type === 'cut') {
                        // local coords of top-left corner relative to cx_abs, cy_abs
                        const lcx = (child.x - cx_abs) / 10;
                        const lcy = -(child.y - cy_abs) / 10;
                        const cw = (child.width || 20) / 10;
                        const ch = (child.height || 20) / 10;

                        const cutPath = new THREE.Path();
                        cutPath.moveTo(lcx, lcy);
                        cutPath.lineTo(lcx + cw, lcy);
                        cutPath.lineTo(lcx + cw, lcy - ch);
                        cutPath.lineTo(lcx, lcy - ch);
                        cutPath.closePath();
                        threeShape.holes.push(cutPath);
                    }
                }
            });

            // Extrusion Settings
            const extrudeSettings = {
                depth: thicknessIn,
                bevelEnabled: true,
                bevelSegments: 2,
                steps: 1,
                bevelSize: 0.04,
                bevelThickness: 0.04
            };

            const geometry = new THREE.ExtrudeGeometry(threeShape, extrudeSettings);
            // Center the glass mesh's thickness on the Z-axis
            geometry.translate(0, 0, -thicknessIn / 2);
            
            const glassMesh = new THREE.Mesh(geometry, glassMaterial);
            glassGroup.add(glassMesh);

            // 4. Render and add accessories inside this glassGroup
            shapes.forEach(child => {
                if (child.type === 'accessory' && isInsideParent(child, parent)) {
                    // local coordinates relative to cx_abs, cy_abs
                    const lax = (child.x - cx_abs) / 10;
                    const lay = -(child.y - cy_abs) / 10;
                    const aw = (child.width || 20) / 10;
                    const ah = (child.height || 20) / 10;

                    const accSubGroup = new THREE.Group();

                    if (child.accessoryType === 'lock') {
                        // Render chrome box
                        const lockGeo = new THREE.BoxGeometry(2.5, 2.5, thicknessIn + 0.3);
                        const lockMesh = new THREE.Mesh(lockGeo, metalMaterial);
                        lockMesh.position.set(lax + 1.25, lay - 1.25, 0);
                        accSubGroup.add(lockMesh);

                        // Render brass keyhole cylinder
                        const keyholeGeo = new THREE.CylinderGeometry(0.35, 0.35, thicknessIn + 0.4, 16);
                        keyholeGeo.rotateX(Math.PI / 2);
                        const keyholeMesh = new THREE.Mesh(keyholeGeo, brassMaterial);
                        keyholeMesh.position.set(lax + 1.25, lay - 1.25, 0);
                        accSubGroup.add(keyholeMesh);
                    }
                    else if (child.accessoryType === 'connector') {
                        // Render flat plate connector
                        const plateGeo = new THREE.BoxGeometry(4.0, 2.0, thicknessIn + 0.25);
                        const plateMesh = new THREE.Mesh(plateGeo, metalMaterial);
                        plateMesh.position.set(lax + 2.0, lay - 1.0, 0);
                        accSubGroup.add(plateMesh);

                        // Render screws
                        const screwGeo = new THREE.CylinderGeometry(0.2, 0.2, thicknessIn + 0.35, 12);
                        screwGeo.rotateX(Math.PI / 2);
                        
                        const screw1 = new THREE.Mesh(screwGeo, darkMetalMaterial);
                        screw1.position.set(lax + 1.0, lay - 1.0, 0);
                        accSubGroup.add(screw1);

                        const screw2 = new THREE.Mesh(screwGeo, darkMetalMaterial);
                        screw2.position.set(lax + 3.0, lay - 1.0, 0);
                        accSubGroup.add(screw2);
                    }
                    else if (child.accessoryType === 'hinge') {
                        // Render hinge body
                        const hingeGeo = new THREE.BoxGeometry(3.0, 2.5, thicknessIn + 0.3);
                        const hingeMesh = new THREE.Mesh(hingeGeo, metalMaterial);
                        hingeMesh.position.set(lax + 1.5, lay - 1.25, 0);
                        accSubGroup.add(hingeMesh);

                        // Cylinder Joint
                        const cylinderGeo = new THREE.CylinderGeometry(0.28, 0.28, 2.5, 16);
                        cylinderGeo.rotateX(Math.PI / 2);
                        const cylinderMesh = new THREE.Mesh(cylinderGeo, metalMaterial);
                        cylinderMesh.position.set(lax, lay - 1.25, 0);
                        accSubGroup.add(cylinderMesh);
                    }
                    else if (child.accessoryType === 'profile') {
                        // Profile aluminum U-channel
                        const profileGeo = new THREE.BoxGeometry(aw, 1.0, thicknessIn + 0.2);
                        const profileMesh = new THREE.Mesh(profileGeo, darkMetalMaterial);
                        profileMesh.position.set(lax + aw / 2, lay - 0.5, 0);
                        accSubGroup.add(profileMesh);
                    }

                    glassGroup.add(accSubGroup);
                }
            });

            // 5. Apply rotations and translations to the entire glassGroup
            glassGroup.position.set(groupX, groupY, groupZ);
            
            const rotX_rad = (parent.rotX || 0) * Math.PI / 180;
            const rotY_rad = (parent.rotY || 0) * Math.PI / 180;
            const rotZ_rad = (parent.rotZ || 0) * Math.PI / 180;
            glassGroup.rotation.set(rotX_rad, rotY_rad, rotZ_rad);

            glassGroup.userData = { shapeId: parent.id };
            scene.add(glassGroup);
        });

        // TransformControls Setup for Interactive 3D Rotation
        const transformControls = new TransformControls(camera, renderer.domElement);
        transformControls.setMode('rotate');
        transformControls.size = 0.8;
        scene.add(transformControls as any);

        transformControls.addEventListener('dragging-changed', (event) => {
            controls.enabled = !event.value;
        });

        transformControls.addEventListener('mouseUp', () => {
            const obj = transformControls.object;
            if (obj && onShapeTransform) {
                const shapeId = obj.userData.shapeId;
                const rotX = Math.round(obj.rotation.x * 180 / Math.PI);
                const rotY = Math.round(obj.rotation.y * 180 / Math.PI);
                const rotZ = Math.round(obj.rotation.z * 180 / Math.PI);
                const zOffset = Math.round(obj.position.z * 10) / 10;
                onShapeTransform(shapeId, { rotX, rotY, rotZ, zOffset });
            }
        });

        // Raycasting for selecting shapes in 3D Preview
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        const handlePointerDown = (e: PointerEvent) => {
            if (transformControls.dragging) return;

            const rect = renderer.domElement.getBoundingClientRect();
            mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

            raycaster.setFromCamera(mouse, camera);
            const intersects = raycaster.intersectObjects(scene.children, true);

            if (intersects.length > 0) {
                let current: THREE.Object3D | null = intersects[0].object;
                while (current && !current.userData?.shapeId) {
                    current = current.parent;
                }
                if (current && onSelectShape) {
                    onSelectShape(current.userData.shapeId);
                }
            } else {
                if (onSelectShape) {
                    onSelectShape(null);
                }
            }
        };

        renderer.domElement.addEventListener('pointerdown', handlePointerDown);

        // Attach controls if a shape is selected
        const selectedGroup = scene.children.find(child => child.userData?.shapeId === selectedShapeId);
        if (selectedGroup) {
            transformControls.attach(selectedGroup);
        } else {
            transformControls.detach();
        }

        // Animation Loop
        let animationFrameId: number;
        const animate = () => {
            animationFrameId = requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
        };
        animate();

        // Handle window resize
        const handleResize = () => {
            if (!containerRef.current) return;
            const w = containerRef.current.clientWidth;
            const h = containerRef.current.clientHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        };
        window.addEventListener('resize', handleResize);

        // Cleanup
        return () => {
            window.removeEventListener('resize', handleResize);
            if (renderer.domElement) {
                renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
            }
            cancelAnimationFrame(animationFrameId);
            controls.dispose();
            transformControls.dispose();
            renderer.dispose();
            if (containerRef.current) {
                containerRef.current.innerHTML = '';
            }
        };
    }, [shapes, thickness, selectedShapeId, onSelectShape, onShapeTransform]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '650px', background: '#111827', borderRadius: '8px', overflow: 'hidden' }}>
            <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
            
            {/* 3D View Instructions Overlay */}
            <div style={{
                position: 'absolute',
                bottom: '1rem',
                left: '1rem',
                background: 'rgba(17, 24, 39, 0.85)',
                color: '#f3f4f6',
                padding: '0.6rem 0.9rem',
                borderRadius: '6px',
                fontSize: '0.7rem',
                pointerEvents: 'none',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.25rem',
                boxShadow: '0 4px 6px rgba(0,0,0,0.3)'
            }}>
                <span style={{ fontWeight: 600, color: 'var(--color-primary-light, #3b82f6)' }}>3D Camera Controls:</span>
                <span>🖱️ Left-Click + Drag to Rotate Camera</span>
                <span>🖱️ Right-Click + Drag to Pan Camera</span>
                <span>🎚️ Scroll to Zoom</span>
                
                <span style={{ fontWeight: 600, color: '#f59e0b', marginTop: '0.35rem', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '0.35rem' }}>Interactive 3D Editor:</span>
                <span>👆 Click a glass sheet to select it</span>
                <span>🔄 Drag colored rings to rotate sheet</span>
            </div>
        </div>
    );
}
